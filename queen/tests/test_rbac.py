"""RBAC 权限体系测试——矩阵、账号级覆盖、REST 403、MCP admin 工具。

权限两层分离的验证：
- 权限域（能不能用）：矩阵 + override 决定，REST 403 / MCP denied
- 数据归属（能看谁的）：service 层过滤（symbiont 测试已覆盖）
"""
import json
import uuid

import pytest
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.permissions import (
    DEFAULT_ROLE_SEEDS, apply_overrides, base_permissions, effective_permissions,
)
from app.core.security import create_access_token
from app.models.perm_override import PermOverride
from app.schemas.request import RegisterRequest
from app.services import user_service


# ---------- 矩阵单元测试 ----------

def test_matrix_shape():
    """种子矩阵核心形状：admin 全域、operator 读用户、wing/antenna 终端域。"""
    assert DEFAULT_ROLE_SEEDS["admin"][1] == ["users", "orders", "feedback", "ai", "system", "crop"]
    assert "users:read" in DEFAULT_ROLE_SEEDS["operator"][1]
    assert "users" not in DEFAULT_ROLE_SEEDS["operator"][1]  # 只读不可写
    assert DEFAULT_ROLE_SEEDS["wing"][1] == ["orders", "feedback", "ai", "crop:read"]  # 终端可检索知识库，不可管理
    assert DEFAULT_ROLE_SEEDS["antenna"][1] == ["orders", "feedback", "ai", "crop:read"]
    assert DEFAULT_ROLE_SEEDS["admin"][2] is True  # admin 锁定


def test_fail_closed():
    assert base_permissions("hacker") == []
    assert base_permissions("") == []


def test_override_deny_wins():
    """deny 绝对优先：grant 同点位不复活。"""
    class O:
        def __init__(self, perm, effect):
            self.perm, self.effect = perm, effect

    base = ["orders", "ai"]
    assert apply_overrides(base, [O("orders", "deny")]) == ["ai"]
    # deny 后再 grant 同点位 → 不复活
    assert apply_overrides(base, [O("orders", "deny"), O("orders", "grant")]) == ["ai"]
    # grant 追加新点位
    assert "feedback" in apply_overrides(base, [O("feedback", "grant")])


# ---------- 集成：造角色用户 ----------

async def _mk_user(role: str) -> dict:
    uname = f"{role}_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db, RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com")
        )
        user.role = role
        db.add(user)
        await db.commit()
        token = create_access_token(subject=str(user.id))
        uid = user.id
    return {"headers": {"Authorization": f"Bearer {token}"}, "id": uid}


# ---------- REST 权限 ----------

async def test_operator_cannot_write_users(client):
    op = await _mk_user("operator")
    # operator 有 users:read → 列表 200
    resp = await client.get("/api/v1/users", headers=op["headers"])
    assert resp.status_code == 200
    # operator 无 users:write → 改角色 403
    resp = await client.patch(f"/api/v1/users/{op['id']}/role", headers=op["headers"], json={"role": "admin"})
    assert resp.status_code == 403
    assert "users:write" in resp.json()["detail"]


async def test_wing_can_access_own_orders_domain(client, auth_headers):
    """矩阵修正后：wing 终端用户可"用"订单域（归属过滤=只见自己的，由 symbiont 测试覆盖）。"""
    resp = await client.get("/api/v1/orders", headers=auth_headers)
    assert resp.status_code == 200


async def test_admin_full_access_and_rbac_lifecycle(client):
    admin = await _mk_user("admin")
    victim = await _mk_user("wing")

    # admin 列表用户
    resp = await client.get("/api/v1/users", headers=admin["headers"], params={"keyword": str(victim["id"])})
    assert resp.status_code == 200

    # admin 改角色 wing→operator
    resp = await client.patch(f"/api/v1/users/{victim['id']}/role", headers=admin["headers"], json={"role": "operator"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "operator"

    # admin 不可改 admin 角色（防自锁）——对另一个 admin 试
    other_admin = await _mk_user("admin")
    resp = await client.patch(f"/api/v1/users/{other_admin['id']}/role", headers=admin["headers"], json={"role": "operator"})
    assert resp.status_code == 403
    resp = await client.patch(f"/api/v1/users/{other_admin['id']}/status", headers=admin["headers"], json={"is_active": False})
    assert resp.status_code == 403

    # admin 给 operator 加 orders:read→已有；改成 deny orders 试试覆盖链
    resp = await client.put(
        f"/api/v1/users/{victim['id']}/perms", headers=admin["headers"],
        json={"perm": "orders", "effect": "deny"},
    )
    assert resp.status_code == 200
    # victim(被 deny orders) 访问订单 → 403
    resp = await client.get("/api/v1/orders", headers=victim["headers"])
    assert resp.status_code == 403
    # 撤销 deny（grant 回）→ operator 模板本有 orders → 200
    resp = await client.put(
        f"/api/v1/users/{victim['id']}/perms", headers=admin["headers"],
        json={"perm": "orders", "effect": "grant"},
    )
    resp = await client.get("/api/v1/orders", headers=victim["headers"])
    assert resp.status_code == 200


# ---------- MCP admin 工具 ----------

def _call(name, arguments=None, id=1):
    return {"jsonrpc": "2.0", "id": id, "method": "tools/call",
            "params": {"name": name, "arguments": arguments}}


async def test_mcp_admin_tools_permission_gated(client):
    admin = await _mk_user("admin")
    wing = await _mk_user("wing")

    # admin 用 get_me → 含全域权限
    resp = await client.post("/api/v1/mcp", headers=admin["headers"], json=_call("get_me", {}))
    perms = json.loads(resp.json()["result"]["content"][0]["text"])["permissions"]
    assert "users" in perms

    # wing 调 admin_list_users → denied（共生体：权限不足结构化拒绝）
    resp = await client.post("/api/v1/mcp", headers=wing["headers"], json=_call("admin_list_users", {}))
    result = resp.json()["result"]
    assert result.get("isError") is True
    assert "缺少" in json.loads(result["content"][0]["text"])["reason"]

    # admin 调 admin_list_users → 200 含列表
    resp = await client.post("/api/v1/mcp", headers=admin["headers"], json=_call("admin_list_users", {"limit": 5}))
    data = json.loads(resp.json()["result"]["content"][0]["text"])
    assert "users" in data and data["count"] >= 1

    # admin 经 MCP 改 wing 角色 → ok（写操作归属留痕）
    resp = await client.post("/api/v1/mcp", headers=admin["headers"],
                             json=_call("admin_set_user_role", {"user_id": wing["id"], "role": "operator"}))
    data = json.loads(resp.json()["result"]["content"][0]["text"])
    assert data["ok"] is True


async def test_admin_create_user_and_order_filter(client):
    """POST /users 新增 + 订单筛选/total header。"""
    admin = await _mk_user("admin")
    import time as _t

    # 新增 operator
    resp = await client.post(
        "/api/v1/users", headers=admin["headers"],
        json={"username": f"new_op_{_t.strftime('%H%M%S')}", "password": "PeriNest!2026", "role": "operator"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "operator"

    # operator 不可新增（无 users:write）→ 403
    op = await _mk_user("operator")
    resp = await client.post(
        "/api/v1/users", headers=op["headers"],
        json={"username": "should_fail", "password": "PeriNest!2026"},
    )
    assert resp.status_code == 403

    # 用户列表 total header
    resp = await client.get("/api/v1/users", headers=admin["headers"], params={"limit": 5})
    assert int(resp.headers["x-total-count"]) >= 1

    # 订单筛选 + total
    resp = await client.get("/api/v1/orders", headers=admin["headers"],
                            params={"keyword": "NOT_EXIST_XYZ"})
    assert resp.headers["x-total-count"] == "0" and resp.json() == []
    resp = await client.get("/api/v1/orders", headers=admin["headers"], params={"status": "pending", "limit": 5})
    assert int(resp.headers["x-total-count"]) >= 1


async def test_dynamic_role_crud(client):
    """动态角色：创建→生效→更新→删除守卫全链路。"""
    admin = await _mk_user("admin")
    role_key = f"auditor_{uuid.uuid4().hex[:6]}"  # 随机 key 保证重复跑幂等

    # 1. 创建角色（只读订单+反馈）
    resp = await client.post("/api/v1/roles", headers=admin["headers"],
        json={"key": role_key, "name": "审计员", "perms": ["orders:read", "feedback:read"]})
    assert resp.status_code == 201

    # 2. 授予用户并验证生效权限
    target = await _mk_user("wing")
    resp = await client.patch(f"/api/v1/users/{target['id']}/role", headers=admin["headers"], json={"role": role_key})
    assert resp.status_code == 200
    resp = await client.get("/api/v1/auth/me/permissions", headers=target["headers"])
    perms = resp.json()["permissions"]
    assert "orders:read" in perms and "orders" not in perms  # 只读无写

    # 3. auditor 只读用户可看订单列表，不能创建（orders:write 缺失）
    resp = await client.get("/api/v1/orders", headers=target["headers"])
    assert resp.status_code == 200
    resp = await client.post("/api/v1/orders", headers=target["headers"],
        json={"items": [{"sku_name": "x", "quantity": 1, "unit_price": 1}]})
    assert resp.status_code == 403

    # 4. 更新角色权限（加 orders 写）
    resp = await client.patch(f"/api/v1/roles/{role_key}", headers=admin["headers"],
        json={"perms": ["orders", "feedback:read"]})
    assert resp.status_code == 200
    resp = await client.get("/api/v1/auth/me/permissions", headers=target["headers"])
    assert "orders" in resp.json()["permissions"]

    # 5. admin 角色锁定不可改权限
    resp = await client.patch("/api/v1/roles/admin", headers=admin["headers"], json={"perms": ["ai"]})
    assert resp.status_code == 422

    # 6. 有用户引用不可删；迁走后可删
    resp = await client.delete(f"/api/v1/roles/{role_key}", headers=admin["headers"])
    assert resp.status_code == 422 and "引用" in resp.json()["detail"]
    await client.patch(f"/api/v1/users/{target['id']}/role", headers=admin["headers"], json={"role": "wing"})
    resp = await client.delete(f"/api/v1/roles/{role_key}", headers=admin["headers"])
    assert resp.status_code == 200

    # 7. 非法权限点拒绝
    resp = await client.post("/api/v1/roles", headers=admin["headers"],
        json={"key": "bad", "name": "x", "perms": ["nonexist"]})
    assert resp.status_code == 422
