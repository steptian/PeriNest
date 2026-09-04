"""全链路冒烟测试：注册 → 登录 → me → 创建订单 → 查询订单（async 统一姿势）。

依赖本机 MySQL (perinest_db) 与 Redis。
"""


async def test_full_user_order_flow(client, auth_headers):
    # 1. me（auth_headers 已注册+签发 token）
    me = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200, me.text
    username = me.json()["username"]
    assert username.startswith("fx_")

    # 2. 登录接口直接验证
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "PeriNest!2026"},
    )
    assert login.status_code == 200, login.text
    assert login.json()["access_token"]

    # 3. 错误密码 → 401
    bad = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "wrong_pass_123"},
    )
    assert bad.status_code == 401

    # 4. 无 token → 401
    noauth = await client.get("/api/v1/orders")
    assert noauth.status_code == 401

    # 5. 创建订单
    order = await client.post(
        "/api/v1/orders",
        headers=auth_headers,
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

    # 6. 列表 + 详情
    lst = await client.get("/api/v1/orders", headers=auth_headers)
    assert lst.status_code == 200
    assert any(o["id"] == order_id for o in lst.json())

    detail = await client.get(f"/api/v1/orders/{order_id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == order_id

    # 7. 校验失败示例：数量为 0 → 422
    invalid = await client.post(
        "/api/v1/orders",
        headers=auth_headers,
        json={"items": [{"sku_name": "x", "quantity": 0, "unit_price": 1}]},
    )
    assert invalid.status_code == 422
