"""Spiracle MCP Server 测试 — JSON-RPC 握手/列表/调用全链路。"""
import json


async def test_mcp_initialize(client, auth_headers):
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 1
    assert data["result"]["protocolVersion"]
    assert "tools" in data["result"]["capabilities"]
    assert "perinest" in data["result"]["serverInfo"]["name"]


async def test_mcp_tools_list_and_call(client, auth_headers):
    # 1. tools/list
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    tools = resp.json()["result"]["tools"]
    names = [t["name"] for t in tools]
    assert {"perinest_health", "list_orders", "ai_chat"} <= set(names)

    # 2. tools/call perinest_health
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json={"jsonrpc": "2.0", "id": 3, "method": "tools/call",
              "params": {"name": "perinest_health", "arguments": {}}},
    )
    payload = json.loads(resp.json()["result"]["content"][0]["text"])
    assert payload["status"] == "ok"
    assert "version" in payload

    # 3. tools/call list_orders（e2e 测试已造过订单）
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json={"jsonrpc": "2.0", "id": 4, "method": "tools/call",
              "params": {"name": "list_orders", "arguments": {"limit": 5}}},
    )
    orders = json.loads(resp.json()["result"]["content"][0]["text"])
    assert isinstance(orders, list)

    # 4. 未知方法 → -32601
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json={"jsonrpc": "2.0", "id": 5, "method": "no/such", "params": {}},
    )
    assert resp.json()["error"]["code"] == -32601


async def test_mcp_requires_auth(client):
    resp = await client.post(
        "/api/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert resp.status_code == 401
