"""Spiracle (气门) — MCP (Model Context Protocol) Server。

让 PeriNest 变成 Claude / Cursor / 任何 MCP 客户端可直接调用的工具服务器：
蜚蠊靠气门呼吸——PeriNest 靠 MCP 与 AI 生态交换信息。

## 共生体原则（Symbiont Principle）

蜚蠊体内有真实的共生菌群：以宿主摄取的食物为食，替宿主完成消化。
PeriNest 的 AI 同理——**以授权用户的身份行事**：

- 权限边界 = 授权用户的边界（JWT 继承，无特权放大）
- 可见数据 = 授权用户可见的数据（list/get 均按归属过滤）
- 可执行操作 = 授权用户可执行的操作（写操作同样落到该用户名下）

AI 不是旁观的超级用户，是替你工作的共生体。

协议子集（Streamable HTTP, JSON-RPC 2.0）：
- initialize / tools/list / tools/call

零额外依赖，纯 FastAPI 实现。认证复用 JWT（Bearer）。
"""
import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.models.order import Order, OrderItem
from app.models.sys_log import SysLog
from app.services import order_service
from app.services.ai_service import ai_service

router = APIRouter(prefix="/mcp", tags=["mcp"])

PROTOCOL_VERSION = "2025-03-26"
SERVER_INFO = {
    "name": "perinest-queen-mcp",
    "version": settings.APP_VERSION,
    "symbiont": "tools execute strictly within the authorizing user's permission scope",
}


# ---- 工具定义（工具面 = 用户操作面） ----

def _tool_definitions() -> list[dict]:
    return [
        {
            "name": "perinest_health",
            "description": "检查 PeriNest Queen 服务健康状态与版本",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "get_me",
            "description": "获取当前授权用户的身份与资料——AI 应先调用它确认自己在替谁工作（共生体原则）",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "list_orders",
            "description": "查询订单列表。⚠️ 权限范围与授权用户完全一致：普通用户仅见自己的订单，admin 可见全部",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 10, "maximum": 50}
                },
            },
        },
        {
            "name": "get_order",
            "description": "查询单个订单详情。⚠️ 仅授权用户本人或 admin 可查，越权访问将被拒绝",
            "inputSchema": {
                "type": "object",
                "properties": {"order_id": {"type": "integer"}},
                "required": ["order_id"],
            },
        },
        {
            "name": "create_order",
            "description": "为授权用户创建订单（AI 代下单，订单归属于授权用户本人）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "sku_name": {"type": "string"},
                                "quantity": {"type": "integer"},
                                "unit_price": {"type": "number"},
                            },
                            "required": ["sku_name", "quantity", "unit_price"],
                        },
                    },
                    "remark": {"type": "string"},
                },
                "required": ["items"],
            },
        },
        {
            "name": "submit_feedback",
            "description": "以授权用户身份提交反馈",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "minLength": 5},
                },
                "required": ["content"],
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


def _text(payload) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, default=str)}]}


def _denied(msg: str) -> dict:
    """共生体原则：越权尝试返回明确拒绝，而非静默降级。"""
    return {
        "content": [{"type": "text", "text": json.dumps({"denied": True, "reason": msg}, ensure_ascii=False)}],
        "isError": True,
    }


async def _call_tool(name: str, args: dict, user, db) -> dict:
    """执行工具。所有数据访问都锚定 user —— 与 REST 行为完全一致。"""
    if name == "perinest_health":
        return _text({
            "status": "ok", "app": settings.APP_NAME,
            "version": settings.APP_VERSION, "ai_mock": settings.ai_mock_enabled,
        })

    if name == "get_me":
        return _text({
            "acting_as": user.username,
            "role": user.role,
            "user_id": user.id,
            "note": "本 AI 会话的全部工具调用均以上述用户身份执行，权限范围一致",
        })

    if name == "list_orders":
        limit = min(int(args.get("limit", 10)), 50)
        # 权限过滤：admin 全量，普通用户仅自己的 —— 与 /api/v1/orders 一致
        stmt = (
            select(Order)
            .options(selectinload(Order.items))
            .order_by(Order.id.desc())
            .limit(limit)
        )
        if user.role != "admin":
            stmt = stmt.where(Order.user_id == user.id)
        result = await db.execute(stmt)
        orders = [
            {
                "id": o.id, "order_no": o.order_no, "status": o.status,
                "amount": float(o.total_amount), "items": [
                    {"sku": it.sku_name, "qty": it.quantity} for it in o.items
                ],
            }
            for o in result.scalars().all()
        ]
        scope = "all (admin)" if user.role == "admin" else f"user:{user.id}"
        return _text({"scope": scope, "count": len(orders), "orders": orders})

    if name == "get_order":
        order_id = int(args.get("order_id", 0))
        order = await order_service.get_order(db, order_id)
        if order is None:
            return _denied(f"订单 {order_id} 不存在")
        if order.user_id != user.id and user.role != "admin":
            return _denied(f"共生体原则：订单 {order_id} 不属于授权用户 {user.username}，已拒绝访问")
        return _text({
            "id": order.id, "order_no": order.order_no, "status": order.status,
            "amount": float(order.total_amount), "remark": order.remark,
            "items": [{"sku": it.sku_name, "qty": it.quantity, "price": float(it.unit_price)} for it in order.items],
        })

    if name == "create_order":
        items = args.get("items", [])
        if not items:
            return _denied("items 不能为空")
        from app.schemas.request import CreateOrderRequest, OrderItemRequest
        try:
            req = CreateOrderRequest(
                remark=args.get("remark"),
                items=[OrderItemRequest(**i) for i in items],
            )
        except Exception as e:  # pydantic 校验失败
            return _denied(f"参数校验失败: {e}")
        order = await order_service.create_order(db, user.id, req)
        return _text({
            "created_for": user.username,
            "order_no": order.order_no,
            "amount": float(order.total_amount),
            "status": order.status,
        })

    if name == "submit_feedback":
        content = str(args.get("content", "")).strip()
        if len(content) < 5:
            return _denied("反馈内容至少 5 个字符")
        db.add(SysLog(user_id=user.id, level="INFO", source="mcp-feedback", message=content))
        await db.flush()
        return _text({"submitted_as": user.username, "ok": True})

    if name == "ai_chat":
        text = await ai_service.chat([
            {"role": "system", "content": "你是 PeriNest 的共生体助手，在授权用户的数据范围内协助其工作。回答简洁。"},
            {"role": "user", "content": str(args.get("message", ""))},
        ])
        return _text({"reply": text})

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
    """MCP Streamable HTTP 入口（单一 POST，JSON 响应）。

    每次调用都携带授权用户身份（JWT），工具执行严格锚定该用户——
    AI 的权限永远无法超过授予它的那个人。
    """
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
        return JSONResponse({}, status_code=202)
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
