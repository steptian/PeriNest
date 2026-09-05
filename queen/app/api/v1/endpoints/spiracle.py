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
from app.core.permissions import (
    USERS, effective_permissions, _parse_perm, _check_perm,
)
from app.services import user_service

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
            "description": "查询订单列表。注意：权限范围与授权用户完全一致：普通用户仅见自己的订单，admin 可见全部",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 10, "maximum": 50}
                },
            },
        },
        {
            "name": "get_order",
            "description": "查询单个订单详情。注意：仅授权用户本人或 admin 可查，越权访问将被拒绝",
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
            "name": "admin_list_users",
            "description": "用户列表（需 users:read 权限，admin/运营可用；AI 权限不足会被拒绝）",
            "inputSchema": {"type": "object", "properties": {"keyword": {"type": "string"}, "limit": {"type": "integer", "default": 20}}},
        },
        {
            "name": "admin_create_user",
            "description": "新增用户（需 users:write；角色 operator/wing/antenna）",
            "inputSchema": {"type": "object", "properties": {"username": {"type": "string"}, "password": {"type": "string"}, "email": {"type": "string"}, "role": {"type": "string", "default": "wing"}}, "required": ["username", "password"]},
        },
        {
            "name": "admin_set_user_role",
            "description": "修改用户角色 admin/operator/wing/antenna（需 users:write，仅 admin；admin 账号锁死不可改）",
            "inputSchema": {"type": "object", "properties": {"user_id": {"type": "integer"}, "role": {"type": "string"}}, "required": ["user_id", "role"]},
        },
        {
            "name": "admin_set_user_status",
            "description": "启用/禁用用户（需 users:write；admin 账号不可禁用）",
            "inputSchema": {"type": "object", "properties": {"user_id": {"type": "integer"}, "is_active": {"type": "boolean"}}, "required": ["user_id", "is_active"]},
        },
        {
            "name": "admin_set_perm_override",
            "description": "账号级权限覆盖 grant/deny（需 users:write；最终权限=角色⊕覆盖，deny 优先）",
            "inputSchema": {"type": "object", "properties": {"user_id": {"type": "integer"}, "perm": {"type": "string"}, "effect": {"type": "string"}}, "required": ["user_id", "perm", "effect"]},
        },
        {
            "name": "admin_role_manage",
            "description": "动态角色管理（需 users:write）：action=list/create/update/delete；admin 角色锁定，有用户引用的角色不可删",
            "inputSchema": {"type": "object", "properties": {"action": {"type": "string"}, "key": {"type": "string"}, "name": {"type": "string"}, "perms": {"type": "array", "items": {"type": "string"}}}, "required": ["action"]},
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
        {
            "name": "crop_search",
            "description": "在知识库（Crop 嗦囊）中做语义检索，返回最相关的文档分块。需 crop:read 权限（四端角色默认具备）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "自然语言查询"},
                    "top_k": {"type": "integer", "default": 5, "maximum": 20},
                },
                "required": ["query"],
            },
        },
        {
            "name": "wecom_contact_search",
            "description": "搜索企微私域客户档案（Cercus 尾须）：按姓名/手机号/关键词查找客户，返回标签、跟进人等全景信息。需 wecom:read 权限",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "姓名/手机号/external_userid 关键词"},
                    "tag": {"type": "string", "description": "按标签过滤（如 高意向）"},
                    "limit": {"type": "integer", "default": 10, "maximum": 50},
                },
            },
        },
        {
            "name": "crop_ingest",
            "description": "把一份文本知识存入知识库（需 crop:write 权限，admin/运营具备）。AI 替授权用户吞入嗉囊",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string", "minLength": 10},
                    "source_type": {"type": "string", "default": "text"},
                },
                "required": ["title", "content"],
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


async def _perm_denied(user, db, perm: str) -> dict | None:
    """共生体权限检查：不足则返回 denied 结构，通过返回 None。"""
    perms = await effective_permissions(user, db)
    domain, action = _parse_perm(perm)
    if not _check_perm(perms, domain, action or "read"):
        return _denied(f"共生体原则：授权用户 {user.username} 缺少「{perm}」权限")
    return None


async def _call_tool(name: str, args: dict, user, db) -> dict:
    """执行工具。所有数据访问都锚定 user —— 与 REST 行为完全一致。"""
    if name == "perinest_health":
        return _text({
            "status": "ok", "app": settings.APP_NAME,
            "version": settings.APP_VERSION, "ai_mock": settings.ai_mock_enabled,
        })

    if name == "get_me":
        perms = await effective_permissions(user, db)
        return _text({
            "acting_as": user.username,
            "role": user.role,
            "user_id": user.id,
            "permissions": perms,
            "note": "本 AI 会话的全部工具调用均以上述用户身份执行，权限范围=上述 permissions",
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

    if name == "admin_list_users":
        if d := await _perm_denied(user, db, f"{USERS}:read"):
            return d
        keyword = str(args.get("keyword", ""))
        limit = min(int(args.get("limit", 20)), 100)
        users, total = await user_service.list_users(db, keyword, limit)
        return _text({
            "total": total, "count": len(users),
            "users": [{"id": u.id, "username": u.username, "role": u.role,
                       "is_active": u.is_active, "last_login_at": str(u.last_login_at or "")}
                      for u in users],
        })

    if name == "admin_create_user":
        if d := await _perm_denied(user, db, f"{USERS}:write"):
            return d
        from app.schemas.request import RegisterRequest
        uname, pwd = str(args.get("username", "")), str(args.get("password", ""))
        role = str(args.get("role", "wing"))
        if role not in ("operator", "wing", "antenna"):
            return _denied("新用户角色仅限 operator/wing/antenna（admin 由引导流程创建）")
        try:
            target = await user_service.register(
                db, RegisterRequest(username=uname, password=pwd, email=args.get("email"))
            )
            if role != "wing":
                target = await user_service.update_user_role(db, target, role, user)
        except user_service.UserExistsError as e:
            return _denied(str(e))
        except ValueError as e:
            return _denied(str(e))
        return _text({"created": target.username, "role": target.role, "ok": True})

    if name == "admin_set_user_role":
        if d := await _perm_denied(user, db, f"{USERS}:write"):
            return d
        target = await user_service.get_by_id(db, int(args.get("user_id", 0)))
        if target is None:
            return _denied("用户不存在")
        try:
            t = await user_service.update_user_role(db, target, str(args.get("role", "")), user)
        except (ValueError, PermissionError) as e:
            return _denied(str(e))
        return _text({"user": t.username, "role": t.role, "ok": True})

    if name == "admin_set_user_status":
        if d := await _perm_denied(user, db, f"{USERS}:write"):
            return d
        target = await user_service.get_by_id(db, int(args.get("user_id", 0)))
        if target is None:
            return _denied("用户不存在")
        try:
            t = await user_service.set_user_status(db, target, bool(args.get("is_active", True)), user)
        except PermissionError as e:
            return _denied(str(e))
        return _text({"user": t.username, "is_active": t.is_active, "ok": True})

    if name == "admin_set_perm_override":
        if d := await _perm_denied(user, db, f"{USERS}:write"):
            return d
        target = await user_service.get_by_id(db, int(args.get("user_id", 0)))
        if target is None:
            return _denied("用户不存在")
        if target.role == "admin":
            return _denied("admin 账号权限锁死，不可覆盖")
        perm, effect = str(args.get("perm", "")), str(args.get("effect", ""))
        if effect not in ("grant", "deny"):
            return _denied("effect 必须是 grant 或 deny")
        from sqlalchemy import delete as _del
        from app.models.perm_override import PermOverride
        await db.execute(_del(PermOverride).where(
            PermOverride.user_id == target.id, PermOverride.perm == perm))
        db.add(PermOverride(user_id=target.id, perm=perm, effect=effect, created_by=user.id))
        await db.flush()
        return _text({"user": target.username, "perm": perm, "effect": effect, "ok": True})

    if name == "admin_role_manage":
        if d := await _perm_denied(user, db, f"{USERS}:write"):
            return d
        from app.services import role_service
        action = str(args.get("action", "list"))
        try:
            if action == "list":
                roles = await role_service.list_roles(db)
                counts = await role_service.role_user_counts(db)
                return _text({"roles": [
                    {"key": r.key, "name": r.name, "locked": r.is_locked,
                     "perms": [p.perm for p in r.perms],
                     "user_count": counts.get(r.key, 0)} for r in roles]})
            if action == "create":
                role = await role_service.create_role(
                    db, str(args.get("key", "")), str(args.get("name", "")),
                    list(args.get("perms", [])), user.id)
                return _text({"created": role.key, "ok": True})
            if action == "update":
                await role_service.update_role(
                    db, str(args.get("key", "")), args.get("name"),
                    args.get("perms"), user.id)
                return _text({"updated": args.get("key"), "ok": True})
            if action == "delete":
                await role_service.delete_role(db, str(args.get("key", "")), user.id)
                return _text({"deleted": args.get("key"), "ok": True})
            return _denied("action 须为 list/create/update/delete")
        except role_service.RoleError as e:
            return _denied(str(e))

    if name == "ai_chat":
        text = await ai_service.chat([
            {"role": "system", "content": "你是 PeriNest 的共生体助手，在授权用户的数据范围内协助其工作。回答简洁。"},
            {"role": "user", "content": str(args.get("message", ""))},
        ])
        return _text({"reply": text})

    if name == "wecom_contact_search":
        if denied := await _perm_denied(user, db, "wecom:read"):
            return denied
        from sqlalchemy import func as _func, select as _sel
        from app.models.wecom import WecomContact
        q = _sel(WecomContact)
        kw = str(args.get("keyword", "")).strip()
        tg = str(args.get("tag", "")).strip()
        if kw:
            q = q.where(WecomContact.name.contains(kw) | WecomContact.remark_mobile.contains(kw) | WecomContact.external_userid.contains(kw))
        if tg:
            q = q.where(WecomContact.tags.contains(tg))
        rows = (await db.execute(q.order_by(WecomContact.id.desc()).limit(int(args.get("limit", 10))))).scalars().all()
        return _text({
            "count": len(rows),
            "contacts": [
                {"name": c.name, "mobile": c.remark_mobile, "tags": c.tags or [],
                 "staff": c.staff_userid, "external_userid": c.external_userid}
                for c in rows
            ],
            "scope": "wecom:read——档案范围与授权用户一致",
        })

    if name == "crop_search":
        if denied := await _perm_denied(user, db, "crop:read"):
            return denied
        from app.services import crop_service
        hits, mock = await crop_service.search(
            db, str(args.get("query", "")), int(args.get("top_k", 5))
        )
        return _text({"query": args.get("query"), "mock_embedding": mock, "hits": hits})

    if name == "crop_ingest":
        if denied := await _perm_denied(user, db, "crop:write"):
            return denied
        from app.schemas.request import CropDocumentCreate
        from app.services import crop_service
        try:
            req = CropDocumentCreate(
                title=str(args.get("title", "")),
                content=str(args.get("content", "")),
                source_type=str(args.get("source_type", "text")),
            )
        except Exception as e:
            return _denied(f"参数不合法: {e}")
        doc = await crop_service.create_document(db, req, user.id)
        await db.commit()
        return _text({"ingested": True, "document_id": doc.id, "chunks": doc.chunk_count, "status": doc.status})

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
