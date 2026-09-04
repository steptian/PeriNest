"""全链路冒烟测试：注册 → 登录 → me → 创建订单 → 查询订单。

依赖本机 MySQL (perinest_db) 与 Redis，验证 Core 腺体 + Nectar 全通。
"""
from fastapi.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    return TestClient(app)


def test_full_user_order_flow():
    with _client() as c:
        # 1. 注册
        # 随机后缀保证重复跑幂等
        username = f"smoke_{__import__('time').strftime('%H%M%S')}"
        reg = c.post(
            "/api/v1/auth/register",
            json={"username": username, "password": "PeriNest!2026", "email": f"{username}@example.com"},
        )
        assert reg.status_code in (201, 409), reg.text  # 409 = 已存在（重复跑）
        user = reg.json()
        assert user["username"] == username

        # 2. 登录
        login = c.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "PeriNest!2026"},
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        assert token
        headers = {"Authorization": f"Bearer {token}"}

        # 3. me
        me = c.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200, me.text
        assert me.json()["username"] == username

        # 4. 错误密码 → 401
        bad = c.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "wrong_pass_123"},
        )
        assert bad.status_code == 401

        # 5. 无 token → 401
        noauth = c.get("/api/v1/orders")
        assert noauth.status_code == 401

        # 6. 创建订单
        order = c.post(
            "/api/v1/orders",
            headers=headers,
            json={
                "remark": "冒烟测试订单",
                "items": [
                    {"sku_name": "测试商品A", "quantity": 2, "unit_price": 9.9},
                    {"sku_name": "测试商品B", "quantity": 1, "unit_price": 199.0},
                ],
            },
        )
        assert order.status_code == 201, order.text
        data = order.json()
        assert data["order_no"].startswith("PN")
        assert data["status"] == "pending"
        assert float(data["total_amount"]) == 218.8  # 9.9*2 + 199
        assert len(data["items"]) == 2
        order_id = data["id"]

        # 7. 查询订单列表 + 详情
        lst = c.get("/api/v1/orders", headers=headers)
        assert lst.status_code == 200
        assert any(o["id"] == order_id for o in lst.json())

        detail = c.get(f"/api/v1/orders/{order_id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["id"] == order_id

        # 8. 校验失败示例：数量为 0 → 422
        invalid = c.post(
            "/api/v1/orders",
            headers=headers,
            json={"items": [{"sku_name": "x", "quantity": 0, "unit_price": 1}]},
        )
        assert invalid.status_code == 422
