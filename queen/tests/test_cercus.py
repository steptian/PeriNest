"""Cercus（尾须）企微私域测试。

覆盖：回调加解密回环、权限门（wing 403 / admin 放行）、客户域 CRUD
（列表/搜索/标签过滤/详情/跟进时间线）、未配企微时 sync 返回 503、
MCP wecom_contact_search 工具（denied + 命中）。
"""
import json
import uuid

import pytest


def _rpc(method: str, params: dict = {}, id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": id, "method": method, "params": params}


def _call(name: str, arguments: dict | None = None, id: int = 1) -> dict:
    return _rpc("tools/call", {"name": name, "arguments": arguments or {}}, id)


def _payload(resp) -> dict:
    return json.loads(resp.json()["result"]["content"][0]["text"])


async def _mk_admin(client):
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"cx_{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db,
            RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com"),
        )
        user.role = "admin"
        db.add(user)
        await db.commit()
        token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}


async def _seed_contact(name: str = "测试客户", tags: list | None = None) -> int:
    from app.core.database import AsyncSessionLocal
    from app.models.wecom import WecomContact

    async with AsyncSessionLocal() as db:
        c = WecomContact(
            external_userid=f"wmExt_{uuid.uuid4().hex[:12]}",
            staff_userid="staff:admin",
            name=name,
            remark_mobile="13800138000",
            tags=tags or ["高意向"],
            kv={},
        )
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c.id


def test_wecom_crypto_roundtrip():
    from app.services import wecom_crypto as wc

    aeskey = "b" * 43
    ct = wc.encrypt_msg(aeskey, "wwcorp123", '{"Event":"change_external_contact"}')
    sig = wc.sign("token1", "1700000000", "nonce9", ct)
    assert wc.verify("token1", "1700000000", "nonce9", ct, sig)
    assert wc.decrypt(aeskey, "wwcorp123", ct) == '{"Event":"change_external_contact"}'
    assert not wc.verify("token1", "1700000000", "WRONG", ct, sig)


async def test_cercus_permission_gate(client, auth_headers):
    """wing 用户（无 wecom 域）访问客户列表 → 403。"""
    resp = await client.get("/api/v1/cercus/contacts", headers=auth_headers)
    assert resp.status_code == 403


async def test_cercus_contact_flow(client):
    """admin：种子客户 → 列表/搜索/标签过滤 → 详情 → 打标签 → 跟进时间线。"""
    headers = await _mk_admin(client)
    cid = await _seed_contact(name="琥珀客户")

    resp = await client.get("/api/v1/cercus/contacts", headers=headers, params={"keyword": "琥珀"})
    assert resp.status_code == 200
    assert any(c["id"] == cid for c in resp.json())

    resp = await client.get("/api/v1/cercus/contacts", headers=headers, params={"tag": "高意向"})
    assert any(c["id"] == cid for c in resp.json())

    resp = await client.get(f"/api/v1/cercus/contacts/{cid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["contact"]["tags"] == ["高意向"]

    resp = await client.put(
        f"/api/v1/cercus/contacts/{cid}/tags", headers=headers, json={"tags": ["高意向", "已复购"]}
    )
    assert resp.json()["tags"] == ["高意向", "已复购"]

    resp = await client.post(
        f"/api/v1/cercus/contacts/{cid}/followup",
        headers=headers,
        json={"content": "电话回访，意向明确", "next_at": "2026-09-10"},
    )
    assert resp.status_code == 201
    resp = await client.get(f"/api/v1/cercus/contacts/{cid}", headers=headers)
    assert len(resp.json()["followups"]) == 1
    assert resp.json()["followups"][0]["next_at"].startswith("2026-09-10")

    # 侧边栏档案（by external_userid）
    resp = await client.get("/api/v1/cercus/sidebar/profile", headers=headers,
                            params={"external_userid": resp.json()["contact"]["external_userid"]})
    assert resp.status_code == 200
    assert resp.json()["contact"]["id"] == cid


async def test_cercus_sync_disabled(client):
    """未配企微凭证：sync 返回 503 结构化禁用（mock 哲学）。"""
    headers = await _mk_admin(client)
    resp = await client.post("/api/v1/cercus/sync", headers=headers)
    assert resp.status_code == 503
    assert "未配置" in resp.json()["detail"]


async def test_mcp_wecom_contact_search(client, auth_headers):
    headers = await _mk_admin(client)
    await _seed_contact(name="尾须测试客户")

    # wing：denied
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers, json=_call("wecom_contact_search", {"keyword": "尾须"})
    )
    assert _payload(resp)["denied"] is True

    # admin：命中
    resp = await client.post(
        "/api/v1/mcp", headers=headers, json=_call("wecom_contact_search", {"keyword": "尾须"})
    )
    data = _payload(resp)
    assert data["count"] >= 1


async def test_cercus_oauth_login_fail_closed(client):
    """OAuth 免登 fail-closed：企微未配置 → 503（不自动建号不绕权）。"""
    resp = await client.post(
        "/api/v1/cercus/wecom/oauth-login", json={"code": "fake_code"}
    )
    assert resp.status_code == 503


async def test_cercus_callback_refresh_disabled():
    """回调精确刷新在未配企微时：get_external_contact 抛错仅记日志不炸。

    注：必须走 session 单 loop（项目铁律），勿在测试内 asyncio.run 另起 loop。
    """
    from app.api.v1.endpoints.cercus import _refresh_one_contact

    await _refresh_one_contact("wmExt_nonexistent", "modify")  # 应静默返回


async def test_cercus_redis_cache_roundtrip():
    """Nectar 缓存层回环：set/get/delete + fail-open（缓存不影响功能）。"""
    from app.services import wecom_service as ws

    await ws._cache_set("cercus:test:key", '{"a":1}', 60)
    assert await ws._cache_get("cercus:test:key") == '{"a":1}'
    await ws._cache_set("cercus:test:k2", "x", 60)
    await ws._cache_delete("cercus:test:*")
    assert await ws._cache_get("cercus:test:key") is None
    assert await ws._cache_get("cercus:test:k2") is None


async def test_wecom_token_cached_in_redis():
    """token 走 Redis 共享缓存：monkeypatch 企微响应后两次调用只打一次外网。"""
    from unittest.mock import AsyncMock, patch

    import app.services.wecom_service as ws
    from app.core.config import settings

    if settings.wecom_enabled:
        pytest.skip("本地配置了真实企微，跳过 mock 测试")

    calls = {"n": 0}

    async def fake_get(self, url, **kw):
        calls["n"] += 1
        class R:
            def json(self):
                return {"access_token": f"tok_{calls['n']}"}
        return R()

    # 临时启用（未配凭证路径）
    with patch.object(settings, "WECOM_CORP_ID", "wwtest"), \
         patch.object(settings, "WECOM_CORP_SECRET", "sec"), \
         patch.object(settings, "WECOM_AGENT_ID", 1):
        with patch.object(ws.httpx.AsyncClient, "get", new=fake_get):
            t1 = await ws.get_access_token()
            t2 = await ws.get_access_token()
    assert t1 == t2 == "tok_1"
    assert calls["n"] == 1  # 第二次命中 Redis 缓存
    await ws._cache_delete("cercus:token")
