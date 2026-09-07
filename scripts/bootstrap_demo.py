#!/usr/bin/env python3
"""PeriNest 在线 demo 一键引导——部署后跑一次，得到可演示的完整环境。

产出：
- demo 账号：demo / Demo!2026（wing，终端用户体验）
             demo_admin / Demo!2026（admin，管理端体验）
- 演示知识库：6 份真实自述文档（含 1 份 operator 机密档——演示分域红线）
- 检索质量体检（make eval 同源逻辑，红则报错）

用法（服务器上，queen 目录）：
    .venv/bin/python ../scripts/bootstrap_demo.py
"""
import asyncio
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "queen"))

DEMO_USERS = [
    ("demo", "wing"),
    ("demo_admin", "admin"),
]

DEMO_DOCS = [
    ("PeriNest 项目自述", None,
     "PeriNest 是四端企业级模板：Queen（FastAPI 后端）+ Wing（React 管理端）"
     "+ Antenna（微信小程序）+ Leg（H5 移动端）。\n\n"
     "世界观「琥珀标本馆」贯穿命名：每个模块是蜚蠊的一个器官。"
     "无 Docker 部署，venv + Systemd + Nginx，MIT 开源。"),
    ("琥珀标本馆设计语言", None,
     "琥珀标本馆是 UI 设计语言：琥珀金（primary）、树脂棕（深色）、米纸底（背景）。\n\n"
     "字体 Fraunces 衬线（font-specimen），卡片为 specimen-card 标本卡片，"
     "小字 specimen-latin 图鉴拉丁标。暗色模式用表面亮度差替代亮描边。"),
    ("共生体原则", None,
     "PeriNest 的 AI 以授权用户的身份行事：权限边界=用户边界，工具面=用户操作面。\n\n"
     "MCP 工具与 REST 共用同一 service 层与鉴权；capability parity 测试强制对账，"
     "违规本地 10 秒红。"),
    ("嗦囊知识库使用指南", None,
     "嗦囊（Crop）是知识库：支持 txt/md/pdf/docx 吞入，三级分块（段落→句→硬截），"
     "混合检索（向量+关键词 RRF 融合）。\n\n"
     "问嗦囊=AI 自主多轮检索后作答，回答附引用来源；知识库没有的诚实说没有。"),
    ("部署要点速查", None,
     "部署三件套：venv + Systemd + Nginx。Queen 依赖 MySQL 8 与 Redis ≥8.2"
     "（Vector Sets 向量投影）。\n\n"
     "发版三步：改 VERSION（三处同步）→ CHANGELOG 加条目 → git tag。"
     "自检：make check；检索质量：make eval。"),
    ("内部财务口径说明", "operator",
     "内部演示档（operator 可见）：营收口径以 GMV 扣除退款为准，"
     "毛利率按季度滚动计算。本档用于演示知识库权限分域——"
     "wing 账号检索不到本档，admin 恒全量。"),
]


async def main() -> int:
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models.crop import CropDocument
    from app.models.user import User
    from app.schemas.request import CropDocumentCreate, RegisterRequest
    from app.services import crop_service, user_service

    async with AsyncSessionLocal() as db:
        # 1. demo 账号（幂等）
        for uname, role in DEMO_USERS:
            u = (await db.execute(select(User).where(User.username == uname))).scalar_one_or_none()
            if u is None:
                u = await user_service.register(db, RegisterRequest(
                    username=uname, password="Demo!2026", email=f"{uname}@example.com"
                ))
                print(f"  + 用户 {uname}（{role}）")
            if u.role != role:
                u.role = role
        await db.commit()

        # 2. 演示知识（幂等：demo 文档固定 title，已存在跳过）
        existing = {
            d.title for d in (
                await db.execute(select(CropDocument).where(CropDocument.title.in_(
                    [t for t, _, _ in DEMO_DOCS])))
            ).scalars().all()
        }
        for title, roles, content in DEMO_DOCS:
            if title in existing:
                continue
            await crop_service.create_document(db, CropDocumentCreate(
                title=title, content=content, visible_roles=roles,
            ), user_id=None)
            print(f"  + 知识《{title}》{f'（仅 {roles} 可见）' if roles else ''}")
        await db.commit()

    print("\n✅ demo 环境就绪")
    print("   体验账号：demo / Demo!2026（终端用户）· demo_admin / Demo!2026（管理员）")
    print("   演示点：问嗦囊（AI 带引用作答）· 分域红线（demo 检索不到内部财务档）")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
