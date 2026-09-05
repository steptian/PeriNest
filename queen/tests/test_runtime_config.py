"""运行时配置（管理端 AI/embedding 配置抽象）测试。"""
import uuid

import pytest


async def _mk_admin(client):
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"rc_{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db, RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com")
        )
        user.role = "admin"
        db.add(user)
        await db.commit()
        token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}


async def test_ai_config_permission_gate(client, auth_headers):
    """wing 用户读/写 AI 配置 → 403（system 域）。"""
    assert (await client.get("/api/v1/system/ai-config", headers=auth_headers)).status_code == 403
    r = await client.put("/api/v1/system/ai-config", headers=auth_headers, json={"updates": {"ai.model": "x"}})
    assert r.status_code == 403


async def test_ai_config_read_masked(client):
    """admin 读：8 键白名单全返回，敏感 key 打码（不含明文）。"""
    headers = await _mk_admin(client)
    r = await client.get("/api/v1/system/ai-config", headers=headers)
    assert r.status_code == 200
    configs = {c["key"]: c for c in r.json()["configs"]}
    assert set(configs) == {
        "ai.api_base", "ai.api_key", "ai.model", "ai.timeout",
        "embedding.api_base", "embedding.api_key", "embedding.model", "embedding.dim",
    }
    for c in configs.values():
        assert c["source"] in ("env", "db")
    # 敏感打码：值不得以明文 sk- 全量出现
    assert "***" in configs["ai.api_key"]["value"] or configs["ai.api_key"]["value"] == ""


async def test_ai_config_write_and_resolve(client):
    """admin 写 → 生效（resolve 优先 DB）→ 清空回落 env。"""
    from app.services import runtime_config as rc

    headers = await _mk_admin(client)
    r = await client.put(
        "/api/v1/system/ai-config", headers=headers,
        json={"updates": {"ai.model": "smoke-test-model"}},
    )
    assert r.status_code == 200
    assert (await rc.resolve("ai.model")) == "smoke-test-model"

    # 非法键 fail-closed
    r = await client.put(
        "/api/v1/system/ai-config", headers=headers,
        json={"updates": {"evil.key": "x"}},
    )
    assert r.status_code == 422

    # 清空回落 env
    r = await client.put(
        "/api/v1/system/ai-config", headers=headers, json={"updates": {"ai.model": ""}}
    )
    assert r.status_code == 200
    from app.core.config import settings

    assert (await rc.resolve("ai.model")) == settings.AI_MODEL
