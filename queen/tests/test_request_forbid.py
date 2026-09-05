"""请求契约 fail-closed 测试：未知字段一律 422，不静默吞掉。

背景（dsh wire 教训）：被接受的写入+不变的故障，教运维"开关没用"
而非"名字写错"。字段拼错必须立即红。
覆盖三类入口：注册（schemas 层）、AI 聊天（endpoints 层）、登录。
"""
import pytest


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/api/v1/auth/register", {"username": "u1", "password": "12345678", "typo_field": "x"}),
        ("/api/v1/auth/login", {"username": "u1", "password": "12345678", "extra": 1}),
    ],
)
async def test_unknown_field_rejected(client, path, payload):
    """StrictRequest 继承面：任何 REST request 模型收到未知字段返回 422。"""
    resp = await client.post(path, json=payload)
    assert resp.status_code == 422, f"{path} 未知字段被静默吞掉: {resp.status_code}"
async def test_ai_chat_unknown_field_rejected(client, auth_headers):
    """AI 聊天入口同样 fail-closed（需鉴权，401 先于 body 校验故单独测）。"""
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "temp": 0.7},
        headers=auth_headers,
    )
    assert resp.status_code == 422, f"ai/chat 未知字段被静默吞掉: {resp.status_code}"
