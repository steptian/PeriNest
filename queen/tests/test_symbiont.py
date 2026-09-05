"""共生体原则（Symbiont Principle）验证测试。

证明：AI 经 MCP 调用时，权限边界 == 授权用户边界。
- 普通用户：只见/只建自己的订单，越权查他人订单被拒
- admin：可见全部
- 写操作：AI 代下的订单归属于授权用户本人
"""
import json

import pytest

from app.core.config import settings


def _rpc(method: str, params: dict = {}, id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": id, "method": method, "params": params}


def _call(name: str, arguments: dict | None = None, id: int = 1) -> dict:
    return _rpc("tools/call", {"name": name, "arguments": arguments or {}}, id)


def _payload(resp) -> dict:
    return json.loads(resp.json()["result"]["content"][0]["text"])


async def _mk_admin(client):
    """造一个 admin 用户并返回 headers（直接改库提升角色）。"""
    import uuid

    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"admin_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db, RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com")
        )
        user.role = "admin"
        db.add(user)
        await db.commit()
        token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}, user.id


async def test_symbiont_get_me_declares_identity(client, auth_headers):
    """AI 第一步：知道自己替谁工作。"""
    resp = await client.post("/api/v1/mcp", headers=auth_headers, json=_call("get_me"))
    data = _payload(resp)
    assert data["acting_as"].startswith("fx_")
    assert "权限范围=上述 permissions" in data["note"]
    assert isinstance(data["permissions"], list) and "ai" in data["permissions"]  # wing 用户必有 ai 域


async def test_symbiont_scope_isolation(client, auth_headers):
    """普通用户的 AI：只见自己的订单（scope 隔离），admin 的 AI：见全部。"""
    # 1. 普通用户先经 MCP 下单（同时验证 AI 代下单归属）
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json=_call("create_order", {"items": [{"sku_name": "共生体测试品", "quantity": 1, "unit_price": 9.9}]}),
    )
    created = _payload(resp)
    assert created["created_for"].startswith("fx_")
    assert created["order_no"].startswith("PN")

    # 2. 同一用户 list_orders —— scope 必须是 user:<id> 而非 all
    resp = await client.post("/api/v1/mcp", headers=auth_headers, json=_call("list_orders", {"limit": 50}))
    data = _payload(resp)
    assert data["scope"].startswith("user:"), "普通用户的 AI 不得看到全库订单"

    # 3. admin 可见全部
    admin_headers, _ = await _mk_admin(client)
    resp = await client.post("/api/v1/mcp", headers=admin_headers, json=_call("list_orders", {"limit": 50}))
    data = _payload(resp)
    assert data["scope"] == "all (admin)"


async def test_symbiont_cross_access_denied(client, auth_headers):
    """越权：普通用户的 AI 查他人订单 → 明确拒绝，绝不静默降级。"""
    # A（auth_headers）先下一单
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json=_call("create_order", {"items": [{"sku_name": "A的订单", "quantity": 1, "unit_price": 1.0}]}),
    )
    a_order_id = _payload(resp).get("order_no")  # 拿 order_no，下面用 REST 查 id
    resp = await client.get("/api/v1/orders", headers=auth_headers)
    a_order = next(o for o in resp.json() if o["order_no"] == a_order_id)

    # B（新用户）的 AI 尝试查 A 的订单
    import uuid

    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"b_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        user_b = await user_service.register(
            db, RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com")
        )
        await db.commit()
        token_b = create_access_token(subject=str(user_b.id))
    headers_b = {"Authorization": f"Bearer {token_b}"}

    resp = await client.post(
        "/api/v1/mcp", headers=headers_b, json=_call("get_order", {"order_id": a_order["id"]})
    )
    result = resp.json()["result"]
    assert result.get("isError") is True
    denied = json.loads(result["content"][0]["text"])
    assert denied["denied"] is True
    assert "共生体原则" in denied["reason"]

    # B 的 list 里也看不到 A 的订单
    resp = await client.post("/api/v1/mcp", headers=headers_b, json=_call("list_orders", {"limit": 50}))
    orders_b = _payload(resp)["orders"]
    assert all(o["id"] != a_order["id"] for o in orders_b)


async def test_symbiont_feedback_attributed(client, auth_headers, monkeypatch):
    """AI 代提交的反馈归属于授权用户。"""
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json=_call("submit_feedback", {"content": "共生体替我提交的反馈"}),
    )
    data = _payload(resp)
    assert data["ok"] is True
    assert data["submitted_as"].startswith("fx_")
