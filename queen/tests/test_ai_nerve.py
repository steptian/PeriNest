"""Nerve AI 网关测试 — mock 模式下零 key 验证全链路（含 SSE 流式）。

注意：本地 .env 若配了真实 AI_API_KEY，mock 测试通过 monkeypatch 强制 mock，
不受环境影响（CI 另有 PERINEST_Q_AI_MOCK=true 双保险）。
"""
from app.core.config import settings


async def test_ai_chat_mock(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "AI_MOCK", True)
    resp = await client.post(
        "/api/v1/ai/chat",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "你好，PeriNest"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "mock" in body["content"]
    assert "PeriNest" in body["content"]


async def test_ai_chat_stream_sse(client, auth_headers, monkeypatch):
    import json

    monkeypatch.setattr(settings, "AI_MOCK", True)
    collected, got_done = [], False
    async with client.stream(
        "POST",
        "/api/v1/ai/chat/stream",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "流式测试"}]},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = json.loads(line.removeprefix("data: "))
            if "delta" in data:
                collected.append(data["delta"])
            if data.get("done"):
                got_done = True
    assert got_done and "".join(collected)
    assert "mock" in "".join(collected)  # 确保走的是 mock 流


async def test_ai_requires_auth(client):
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "x"}]},
    )
    assert resp.status_code == 401
