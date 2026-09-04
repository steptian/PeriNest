"""健康检查冒烟测试 — 不依赖 DB/Redis 的最小可跑测试。"""
from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


def test_openapi_contract():
    """契约存在性：/openapi.json 是三端联调的唯一数据源。"""
    with TestClient(app) as client:
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        paths = resp.json()["paths"]
        assert "/api/v1/auth/login" in paths
        assert "/api/v1/orders" in paths
