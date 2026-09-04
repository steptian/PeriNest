"""健康检查 + 契约存在性测试（async 统一姿势）。"""


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


async def test_openapi_contract(client):
    """契约存在性：/openapi.json 是四端联调的唯一数据源。"""
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/orders" in paths
    assert "/api/v1/ai/chat/stream" in paths
