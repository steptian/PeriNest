"""Spiracle (气门) — MCP (Model Context Protocol) Server。

让 PeriNest 变成 Claude / Cursor / 任何 MCP 客户端可直接调用的工具服务器：
蜚蠊靠气门呼吸——PeriNest 靠 MCP 与 AI 生态交换信息。

协议子集（Streamable HTTP, JSON-RPC 2.0）：
- initialize        握手 + 能力协商
- tools/list        列出可调用工具
- tools/call        调用工具

零额外依赖，纯 FastAPI 实现。认证复用 JWT（Bearer）。
"""
import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.models.order import Order
from app.services.ai_service import ai_service

router = APIRouter(prefix="/mcp", tags=["mcp"])

PROTOCOL_VERSION = "2025-03-26"
SERVER_INFO = {"name": "perinest-queen-mcp", "version": settings.APP_VERSION}


# ---- 工具定义 ----

def _tool_definitions() -> list[dict]:
    return [
        {
            "name": "perinest_health",
            "description": "检查 PeriNest Queen 服务健康状态与版本",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "list_orders",
            "description": "查询 PeriNest 订单列表（最近 N 条）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 10, "maximum": 50}
                },
            },
        },
        {
            "name": "ai_chat",
            "description": "调用 PeriNest AI 网关（Nerve）进行一次对话（非流式）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "用户消息"}
                },
                "required": ["message"],
            },
        },
    ]


async def _call_tool(name: str, args: dict, user, db) -> dict:
    """执行工具，返回 MCP content 结构。"""
    if name == "perinest_health":
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "status": "ok",
                            "app": settings.APP_NAME,
                            "version": settings.APP_VERSION,
                            "ai_mock": settings.ai_mock_enabled,
                        },
                        ensure_ascii=False,
                    ),
                }
            ]
        }
    if name == "list_orders":
        limit = min(int(args.get("limit", 10)), 50)
        result = await db.execute(select(Order).order_by(Order.id.desc()).limit(limit))
        orders = [
            {"id": o.id, "order_no": o.order_no, "status": o.status, "amount": float(o.total_amount)}
            for o in result.scalars().all()
        ]
        return {"content": [{"type": "text", "text": json.dumps(orders, ensure_ascii=False)}]}
    if name == "ai_chat":
        text = await ai_service.chat([
            {"role": "system", "content": "你是 PeriNest 的 MCP 工具助手，回答简洁。"},
            {"role": "user", "content": str(args.get("message", ""))},
        ])
        return {"content": [{"type": "text", "text": text}]}
    raise ValueError(f"unknown tool: {name}")


class RpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: int | str | None = None
    method: str
    params: dict = {}


def _rpc_result(req_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _rpc_error(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


@router.post("")
async def mcp_endpoint(rpc: RpcRequest, user: CurrentUser, db: DBSession) -> JSONResponse:
    """MCP Streamable HTTP 入口（单一 POST，JSON 响应）。"""
    if rpc.method == "initialize":
        return JSONResponse(
            _rpc_result(
                rpc.id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": SERVER_INFO,
                },
            )
        )
    if rpc.method == "notifications/initialized":
        return JSONResponse({}, status_code=202)  # 通知无响应体
    if rpc.method == "tools/list":
        return JSONResponse(_rpc_result(rpc.id, {"tools": _tool_definitions()}))
    if rpc.method == "tools/call":
        name = rpc.params.get("name", "")
        args = rpc.params.get("arguments", {}) or {}
        try:
            result = await _call_tool(name, args, user, db)
            return JSONResponse(_rpc_result(rpc.id, result))
        except ValueError as e:
            return JSONResponse(_rpc_error(rpc.id, -32602, str(e)))
        except Exception as e:  # noqa: BLE001 — 工具异常转 JSON-RPC error
            return JSONResponse(_rpc_error(rpc.id, -32603, f"tool execution failed: {e}"))
    return JSONResponse(_rpc_error(rpc.id, -32601, f"method not found: {rpc.method}"))
