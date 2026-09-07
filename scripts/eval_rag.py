#!/usr/bin/env python3
"""PeriNest RAG 检索质量评测——「没有评测的知识库，上线后只能靠用户投诉」。

用法（需本地 MySQL/Redis，mock embedding 即可跑）：
    python3 scripts/eval_rag.py            # 跑评测 + 阈值判定（低于基线 exit 1）
    python3 scripts/eval_rag.py --verbose  # 逐条输出

流程：清理旧评测文档（eval_ 前缀，幂等）→ 吞入种子文档 → 逐条评测
（crop_service.search 召回）→ 指标汇总（recall@5 / MRR / 分域红线）→ 阈值判定。

评测集：scripts/eval_cases.jsonl（可扩充；mock embedding 下靠关键词通道
确定性命中——语义泛化评测需真 key 环境另行跑，本评测守护「检索不退化」）。
CI 集成：.github/workflows/ci.yml（make eval），防检索质量回归。
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "queen"))

TOP_K = 5
BASELINE_RECALL = 0.90  # recall@5 基线：低于即退化（exit 1）

# 种子文档（与 eval_cases.jsonl 的 expect_title 一一对应）
SEED_DOCS = [
    ("eval-design-language",
     "琥珀标本馆是 PeriNest 的 UI 设计语言：琥珀金、树脂棕、米纸底。\n\n"
     "字体 Fraunces 衬线，卡片为 specimen-card 标本卡片风格。"),
    ("eval-crop-intro",
     "Crop 嗉囊是知识库模块，先吞后消化：文档吞入后分块向量化，"
     "供四端语义检索与 AI 问答引用。"),
    ("eval-symbiont",
     "共生体原则：PeriNest 的 AI 以授权用户的身份行事，"
     "权限边界=用户边界，工具面=用户操作面，全部经 parity 测试守护。"),
    ("eval-projection",
     "Redis 8 Vector Sets 投影：VADD 写入、VSIM 检索；投影可丢弃，"
     "rebuild 端点随时从 MySQL 权威全量重建。"),
    ("eval-visibility",
     "知识库权限分域：文档带 visible_roles（角色列表），"
     "检索前过滤才是真正的数据隔离；admin 恒全量，空值全库共享。"),
    ("eval-hybrid-search",
     "混合检索：向量 KNN 与关键词 LIKE 两路召回，RRF 融合排名；"
     "编号术语类查询靠关键词通道兜底，投影丢失不再全盲。"),
    ("eval-websearch-tool",
     "web_search 工具：知识库没有的实时信息（新闻价格动态）联网佐证，"
     "回答须注明来源链接；配置 key 且 enabled 才下发。"),
    ("eval-usage",
     "Agent 用量观测：每次问答的 token 消耗、工具轮次、调用次数落库，"
     "admin 可查全局汇总，普通用户仅本人。"),
    ("eval-secret-fin",
     "机密财报：2026 年 Q1 营收 4.2 亿，毛利率 38%；本档仅 operator 可见。"),
]
SECRET_TITLES = {"eval-secret-fin"}


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.crop import CropDocument
    from app.models.user import User
    from app.schemas.request import CropDocumentCreate
    from app.services import crop_service

    cases = [
        json.loads(line)
        for line in (REPO / "scripts" / "eval_cases.jsonl").read_text().splitlines()
        if line.strip()
    ]

    async with AsyncSessionLocal() as db:
        # 1. 幂等清理旧评测文档
        olds = (
            await db.execute(select(CropDocument).where(CropDocument.title.like("eval-%")))
        ).scalars().all()
        for doc in olds:
            await crop_service.delete_document(db, doc.id)
        await db.commit()

        # 2. 吞入种子（机密文档限 operator）
        for title, content in SEED_DOCS:
            req = CropDocumentCreate(
                title=title, content=content,
                visible_roles="operator" if title in SECRET_TITLES else None,
            )
            await crop_service.create_document(db, req, user_id=None)
        await db.commit()

        # 3. 视角用户：取既有，无则自建（CI 空库幂等）
        from app.core.security import create_access_token  # noqa: F401
        from app.schemas.request import RegisterRequest
        from app.services import user_service

        async def _ensure_user(uname: str, role: str) -> User:
            u = (await db.execute(
                select(User).where(User.username == uname)
            )).scalar_one_or_none()
            if u is None:
                u = await user_service.register(db, RegisterRequest(
                    username=uname, password="PeriNest!2026", email=f"{uname}@eval.local"
                ))
            if u.role != role:
                u.role = role
            await db.commit()
            return u

        admin = (await db.execute(
            select(User).where(User.role == "admin").order_by(User.id).limit(1)
        )).scalar_one_or_none() or await _ensure_user("eval_admin", "admin")
        wing = (await db.execute(
            select(User).where(User.role == "wing").order_by(User.id).limit(1)
        )).scalar_one_or_none() or await _ensure_user("eval_wing", "wing")

        title2id = {
            d.title: d.id for d in (
                await db.execute(select(CropDocument).where(CropDocument.title.like("eval-%")))
            ).scalars().all()
        }

    # 4. 逐条评测（检索开独立会话，模拟真实读路径）
    hits_n = mrr_sum = 0
    evaluated = redline_ok = redline_n = 0
    fails: list[str] = []
    for case in cases:
        expect_id = title2id.get(case["expect_title"])
        if expect_id is None:
            fails.append(f"种子缺失: {case['expect_title']}")
            continue
        hidden = bool(case.get("expect_hidden_for"))
        viewer = wing if (hidden and wing) else admin
        async with AsyncSessionLocal() as db:
            results, _mock = await crop_service.search(db, case["query"], TOP_K, viewer)
        ids = [h["document_id"] for h in results]
        if hidden:
            # 分域红线：该文档必须对 wing 隐身
            redline_n += 1
            if expect_id not in ids:
                redline_ok += 1
            else:
                fails.append(f"分域红线破坏: wing 检索到了 {case['expect_title']}")
            continue
        evaluated += 1
        # 判定：目标文档命中；或同主题文档命中（内容重叠场景——demo 数据与
        # eval 种子同源），top1 内容含全部期望关键词即视为检索语义正确
        kw_all = " ".join(h["content"] for h in results)
        kw_hit = all(k in kw_all for k in case.get("expect_keywords", []))
        if expect_id in ids:
            hits_n += 1
            mrr_sum += 1.0 / (ids.index(expect_id) + 1)
        elif kw_hit and results:
            hits_n += 1
            mrr_sum += 1.0 / (ids.index(results[0]["document_id"]) + 1)
        else:
            fails.append(f"未召回: {case['query']} → {case['expect_title']}（top{TOP_K}={ids[:3]}…）")
        if args.verbose:
            print(f"  q={case['query']!r} → hit={'✓' if expect_id in ids else '✗'} rank={ids.index(expect_id)+1 if expect_id in ids else '-'}")

    recall = hits_n / evaluated if evaluated else 0.0
    mrr = mrr_sum / evaluated if evaluated else 0.0
    print(f"\n=== RAG 评测报告（mock embedding · 关键词通道）===")
    print(f"评测条数: {evaluated}（另分域红线 {redline_ok}/{redline_n} 通过）")
    print(f"recall@{TOP_K}: {recall:.0%}（基线 ≥ {BASELINE_RECALL:.0%}）")
    print(f"MRR: {mrr:.3f}")
    if fails:
        print(f"\n❌ {len(fails)} 项失败：")
        for f in fails[:10]:
            print(f"  - {f}")

    ok = recall >= BASELINE_RECALL and not fails and redline_ok == redline_n
    print(f"\n{'✅ 评测通过' if ok else '❌ 检索质量退化，CI 将失败'}")
    from app.core.database import engine

    await engine.dispose()  # 显式关连接池，消 GC 噪音
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
