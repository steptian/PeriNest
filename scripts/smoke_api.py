#!/usr/bin/env python3
"""PeriNest 全流程 API 冒烟测试（真实 HTTP，对运行中的 Queen）。

用法：先起 dev（make dev 或 uvicorn --port 8000），再：
    python3 scripts/smoke_api.py [BASE_URL]   # 默认 http://127.0.0.1:8000

覆盖：健康/版本 → 认证注册登录 → RBAC → 订单 → 反馈 → AI(mock) →
Crop RAG 全流程（吞入/检索/投影重建/删除）→ Cercus（未配企微语义）→
MCP 10 工具 → fail-closed 契约。

幂等：账号/订单随机后缀；Crop 测试数据自建自删。
"""
import asyncio
import json
import sys
import time
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"
PASS, FAIL = [], []


def check(name: str, cond: bool, detail: str = ""):
    (PASS if cond else FAIL).append(name)
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f"  [{detail}]" if detail and not cond else ""))


async def main():
    t0 = time.time()
    async with httpx.AsyncClient(timeout=30) as c:

        # ---- 1. 健康与版本 ----
        r = await c.get(f"{BASE}/health")
        check("health 200", r.status_code == 200, r.text)
        version = r.json().get("version", "?")

        # ---- 2. 认证流 ----
        uname = f"smoke_{uuid.uuid4().hex[:8]}"
        r = await c.post(f"{API}/auth/register", json={"username": uname, "password": "PeriNest!2026"})
        check("register 201", r.status_code == 201, r.text)
        r = await c.post(f"{API}/auth/login", json={"username": uname, "password": "PeriNest!2026"})
        check("login 200", r.status_code == 200, r.text)
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = await c.get(f"{API}/auth/me", headers=h)
        check("auth/me", r.status_code == 200 and r.json()["username"] == uname)
        check("me.role=wing（默认）", r.json().get("role") == "wing")

        # ---- 3. fail-closed 契约 ----
        r = await c.post(f"{API}/auth/login", json={"username": uname, "password": "x" * 8, "typo": 1})
        check("StrictRequest 422（未知字段拒绝）", r.status_code == 422)

        # ---- 4. 版本说明 ----
        r = await c.get(f"{API}/system/version", headers=h)
        ok = r.status_code == 200 and r.json()["version"] == version and len(r.json()["changelog"]) > 0
        check("system/version（版本+changelog）", ok, r.text[:100])
        check("changelog 最新版含 sections", bool(r.json()["changelog"][0].get("sections")))

        # ---- 5. 订单流 ----
        r = await c.post(
            f"{API}/orders", headers=h,
            json={"items": [{"sku_name": f"smoke-sku-{uuid.uuid4().hex[:4]}", "quantity": 2, "unit_price": 99.5}]},
        )
        check("create order 201", r.status_code == 201, r.text)
        order_id = r.json()["id"]
        r = await c.get(f"{API}/orders", headers=h)
        check("list orders（含新建）", r.status_code == 200 and any(o["id"] == order_id for o in r.json()))
        r = await c.get(f"{API}/orders/{order_id}", headers=h)
        check("get order detail", r.status_code == 200)

        # ---- 6. 反馈 ----
        r = await c.post(f"{API}/feedback", headers=h, json={"content": f"冒烟反馈 {uuid.uuid4().hex[:6]}"})
        check("feedback 201", r.status_code in (200, 201), f"{r.status_code} {r.text[:100]}")

        # ---- 7. AI（真实 provider——未配 key 时环境为 mock，断言兼容两种）----
        r = await c.post(f"{API}/ai/chat", headers=h, json={"messages": [{"role": "user", "content": "用五个字回答：冒烟测试收到没"}]})
        ok = r.status_code == 200 and len(r.json().get("content", "")) > 0
        check("ai/chat 真实回复", ok, r.text[:150])
        print(f"    ↳ AI 回复：{r.json().get('content', '')[:60]}")

        # ---- 8. Crop RAG 全流程（写入流需 crop:write——admin 段）----
        import os
        admin_h = None
        r = await c.post(f"{API}/auth/login", json={
            "username": os.environ.get("SMOKE_ADMIN_USER", "smoke_admin"),
            "password": os.environ.get("SMOKE_ADMIN_PASS", "PeriNest!2026"),
        })
        if r.status_code == 200:
            admin_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        else:
            print("    ↳ 无可用 admin（可 SMOKE_ADMIN_USER/PASS 指定），Crop 写入流降级为权限门断言")

        doc_title = f"冒烟知识_{uuid.uuid4().hex[:6]}"
        knowledge = (
            "PeriNest 冒烟测试知识。\n\n"
            "琥珀标本馆是 UI 设计语言：琥珀金、树脂棕、米纸底。\n\n"
            "嗦囊 Crop 负责 RAG 知识检索，先吞后消化。"
        )
        write_h = admin_h or h
        r = await c.post(f"{API}/crop/documents", headers=write_h, json={"title": doc_title, "content": knowledge})
        if admin_h is None:
            check("crop ingest 权限门（无 admin 时 wing 403）", r.status_code == 403)
        else:
            check("crop ingest 201（admin）", r.status_code == 201, r.text[:150])
        if r.status_code == 201:
            doc = r.json()
            check("crop status=ready + chunks>=1", doc["status"] == "ready" and doc["chunk_count"] >= 1)
            r = await c.post(f"{API}/crop/search", headers=h, json={"query": "琥珀 设计语言", "top_k": 3})
            ok = r.status_code == 200 and len(r.json()["hits"]) >= 1
            check("crop search 命中", ok)
            r = await c.get(f"{API}/crop/documents/{doc['id']}", headers=h)
            check("crop detail（chunks 对齐）", r.status_code == 200 and len(r.json()["chunks"]) == doc["chunk_count"])
            # 权限门：wing 无 crop:write
            r = await c.post(f"{API}/crop/documents", headers=h, json={"title": "x", "content": "y" * 20})
            check("crop write 权限门（wing 403）", r.status_code == 403)
            # 文件吞入（txt 直通 + 拒绝不支持格式）
            r = await c.post(
                f"{API}/crop/documents/upload", headers=admin_h,
                files={"file": ("smoke.md", "# 冒烟 markdown\n\n文件吞入链路验证。".encode(), "text/markdown")},
            )
            check("crop 文件上传（md）", r.status_code == 201 and r.json()["source_type"] == "markdown", r.text[:120])
            if r.status_code == 201:
                up_doc = r.json()
                r2 = await c.post(f"{API}/crop/search", headers=h, json={"query": "文件吞入"})
                check("上传后检索命中", any(x["document_id"] == up_doc["id"] for x in r2.json()["hits"]))
                await c.delete(f"{API}/crop/documents/{up_doc['id']}", headers=admin_h)
            r = await c.post(
                f"{API}/crop/documents/upload", headers=admin_h,
                files={"file": ("x.xls", b"binary", "application/excel")},
            )
            check("不支持格式 422", r.status_code == 422)
            # 投影重建 + 检索恢复（admin）
            r0 = await c.post(f"{API}/crop/search", headers=h, json={"query": "琥珀"})
            hit_before = len(r0.json()["hits"])
            r = await c.post(f"{API}/crop/projection/rebuild", headers=admin_h or h)
            check("crop 投影重建", r.status_code == 200 and r.json()["rebuilt"] > 0, r.text[:100])
            r = await c.post(f"{API}/crop/search", headers=h, json={"query": "琥珀"})
            check("重建后检索恢复", r.status_code == 200 and len(r.json()["hits"]) >= min(hit_before, 1))
            # 删除
            r = await c.delete(f"{API}/crop/documents/{doc['id']}", headers=admin_h or h)
            check("crop 删除", r.status_code == 200)
            r = await c.post(f"{API}/crop/search", headers=h, json={"query": doc_title})
            check("删除后不再命中", all(x["document_id"] != doc["id"] for x in r.json()["hits"]))

        # ---- 9. Cercus（未配企微语义 + 权限门）----
        r = await c.get(f"{API}/cercus/health", headers=h)
        check("cercus health", r.status_code == 200 and "wecom_enabled" in r.text)
        r = await c.get(f"{API}/cercus/contacts", headers=h)
        check("cercus 权限门（wing 403）", r.status_code == 403)
        r = await c.post(f"{API}/cercus/wecom/oauth-login", json={"code": "fake"})
        check("cercus oauth fail-closed（未配 503）", r.status_code == 503)

        # ---- 10. MCP ----
        r = await c.post(f"{API}/mcp", headers=h, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})
        tools = {t["name"] for t in r.json()["result"]["tools"]}
        expected = {"get_me", "list_orders", "get_order", "create_order", "submit_feedback",
                    "ai_chat", "crop_search", "crop_ingest", "wecom_contact_search", "perinest_health"}
        check(f"MCP tools/list（{len(tools)} 个）", expected <= tools, str(tools))

        def rpc_call(name, args):
            return c.post(f"{API}/mcp", headers=h, json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                                          "params": {"name": name, "arguments": args}})
        r = await rpc_call("get_me", {})
        check("MCP get_me（身份声明）", "acting_as" in r.json()["result"]["content"][0]["text"])
        r = await rpc_call("crop_search", {"query": "嗦囊", "top_k": 2})
        payload = json.loads(r.json()["result"]["content"][0]["text"])
        mock_emb = payload.get("mock_embedding")
        check("MCP crop_search（embedding mock 如实标记）", isinstance(mock_emb, bool) and len(payload.get("hits", [])) >= 1, str(payload)[:150])
        r = await rpc_call("wecom_contact_search", {"keyword": "x"})
        payload = json.loads(r.json()["result"]["content"][0]["text"])
        check("MCP wecom_contact_search（wing denied）", payload.get("denied") is True)

        # ---- 10.5 AI 运行时配置（admin 段）----
        if admin_h:
            r = await c.get(f"{API}/system/ai-config", headers=admin_h)
            cfgs = {x["key"]: x for x in r.json().get("configs", [])}
            ok = r.status_code == 200 and len(cfgs) == 14 and "***" in cfgs["ai.api_key"]["value"]
            check("ai-config 读（14 键+key 打码）", ok)
            r = await c.put(f"{API}/system/ai-config", headers=admin_h, json={"updates": {"ai.timeout": "90"}})
            check("ai-config 写（即时生效）", r.status_code == 200)
            r = await c.post(f"{API}/system/ai-config/test", headers=admin_h)
            check("ai-config 测试连接（真实模型回复）", r.status_code == 200 and r.json().get("ok") is True, r.text[:100])
            await c.put(f"{API}/system/ai-config", headers=admin_h, json={"updates": {"ai.timeout": ""}})  # 还原
            r = await c.put(f"{API}/system/ai-config", headers=admin_h, json={"updates": {"evil.key": "x"}})
            check("ai-config 白名单 fail-closed（422）", r.status_code == 422)
        else:
            check("ai-config 权限门（wing 403）", (await c.get(f"{API}/system/ai-config", headers=h)).status_code == 403)

        # ---- 11. 越权与未授权 ----
        r = await c.get(f"{API}/orders")
        check("未认证 401", r.status_code == 401)
        r = await c.get(f"{API}/users", headers=h)
        check("users 域权限门（wing 403）", r.status_code == 403)

    dt = time.time() - t0
    print(f"\n{'=' * 50}\n冒烟结果：✅ {len(PASS)} 通过 / ❌ {len(FAIL)} 失败 / 耗时 {dt:.1f}s")
    if FAIL:
        print("失败项：", *FAIL, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
