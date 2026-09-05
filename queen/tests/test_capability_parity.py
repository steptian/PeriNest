"""能力对称性测试（Capability Parity）——共生体原则的执行机制。

原则：用户在 REST 上的每一个能力，AI 经 MCP 必须同样具备（或声明豁免理由）。
本测试从 OpenAPI 拉取全部路由，与 MCP tools 强制对账：

- 正向：每个用户能力端点 → 必须存在映射的 MCP 工具
- 反向：每个 MCP 工具 → 必须能追溯到某个 REST 端点（防幽灵能力）
- 豁免清单：必须写明理由，无理由豁免视为破坏原则

**新增 REST 端点而未决策 AI 面（加工具 or 加豁免）→ 本测试失败 → CI 红。**
这就是"以后每个接口都一样"的机制保证。
"""
import httpx

import pytest

API_PREFIX = "/api/v1"

# ---- 能力映射表：REST 端点 ↔ MCP 工具 ----
# 新增端点时必须在此登记：映射到工具，或加入豁免清单并写明理由。
PARITY_MAP: dict[str, list[str]] = {
    f"{API_PREFIX}/auth/me": ["get_me"],
    f"{API_PREFIX}/orders": ["list_orders", "create_order"],   # GET+POST 双能力
    f"{API_PREFIX}/orders/{{order_id}}": ["get_order"],
    f"{API_PREFIX}/feedback": ["submit_feedback"],
    f"{API_PREFIX}/ai/chat": ["ai_chat"],
}

# ---- 豁免清单：天然不需要 MCP 化的端点，理由必填 ----
EXEMPT: dict[str, str] = {
    f"{API_PREFIX}/auth/login": "身份获得入口——MCP 调用前必须已持有 JWT，逻辑前置",
    f"{API_PREFIX}/auth/register": "同上，身份创建先于任何 AI 授权",
    f"{API_PREFIX}/auth/wx-login": "同上，微信通道的身份入口",
    f"{API_PREFIX}/mcp": "MCP 端点是 AI 面自身的入口，不构成用户操作能力",
    f"{API_PREFIX}/ai/chat/stream": "SSE 流式通道，MCP 的 ai_chat 已覆盖其非流式语义",
    "/health": "基础设施探针，非用户操作面",
    "/healthz": "存活探针，非用户操作面",
}


async def _openapi_paths(client) -> set[str]:
    resp = await client.get("/openapi.json")
    return set(resp.json()["paths"].keys())


async def _mcp_tools(client, headers) -> set[str]:
    resp = await client.post(
        "/api/v1/mcp", headers=headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    return {t["name"] for t in resp.json()["result"]["tools"]}


async def test_capability_parity(client, auth_headers):
    """每个用户能力端点都有对应 MCP 工具；每个 MCP 工具都可追溯到 REST。"""
    paths = await _openapi_paths(client)
    tools = await _mcp_tools(client, auth_headers)

    # 1. 正向：能力端点 → MCP 工具存在
    uncovered: list[str] = []
    for path, mapped_tools in PARITY_MAP.items():
        if path not in paths:
            uncovered.append(f"{path}: 已从 OpenAPI 消失，请更新 PARITY_MAP")
            continue
        for t in mapped_tools:
            if t not in tools:
                uncovered.append(f"{path}: 缺少 MCP 工具 '{t}'——共生体原则要求能力对称，或登记豁免")
    assert not uncovered, "能力缺口:\n" + "\n".join(uncovered)

    # 2. 反向：MCP 工具必须有 REST 来源（豁免：基础设施类工具）
    rest_backed = {t for ts in PARITY_MAP.values() for t in ts} | {"perinest_health"}
    ghost = tools - rest_backed
    assert not ghost, f"幽灵工具（无 REST 来源）: {ghost}"

    # 3. 全覆盖检查：OpenAPI 里的每个用户端点都被"映射或豁免"
    user_paths = {p for p in paths if p not in ("/health", "/healthz")}
    accounted = set(PARITY_MAP) | set(EXEMPT)
    missing = user_paths - accounted
    assert not missing, (
        "新端点未做 AI 面决策（共生体原则）:\n"
        + "\n".join(missing)
        + "\n→ 登记到 PARITY_MAP（加 MCP 工具）或 EXEMPT（写明豁免理由）"
    )


async def test_exempt_registry_is_documented():
    """豁免必须带理由——无理由豁免=破坏原则。"""
    for path, reason in EXEMPT.items():
        assert len(reason.strip()) >= 8, f"豁免 {path} 理由过于敷衍: '{reason}'"
