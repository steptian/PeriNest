"""Cercus MCP 工具（从 spiracle 抽出——工具随插件走，工具面=用户操作面）。"""
from typing import Any


TOOL_DEFINITIONS = [
    {
        "name": "wecom_contact_search",
        "description": "搜索企微外部联系人（需 wecom:read 权限）。档案范围与授权用户一致",
        "inputSchema": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "姓名/手机号/external_userid 片段"},
                "tag": {"type": "string", "description": "标签精确匹配"},
                "limit": {"type": "integer", "default": 10, "maximum": 50},
            },
        },
    },
]


async def execute_tool(name: str, user, db, args: dict) -> dict:
    """执行 cercus 工具，返回载荷 dict（权限门在 spiracle 分发层统一做）。"""
    if name != "wecom_contact_search":
        return {"error": f"unknown cercus tool: {name}"}
    from sqlalchemy import select as _sel

    from .models import WecomContact

    q = _sel(WecomContact)
    kw = str(args.get("keyword", "")).strip()
    tg = str(args.get("tag", "")).strip()
    if kw:
        q = q.where(
            WecomContact.name.contains(kw)
            | WecomContact.remark_mobile.contains(kw)
            | WecomContact.external_userid.contains(kw)
        )
    if tg:
        q = q.where(WecomContact.tags.contains(tg))
    rows = (
        await db.execute(q.order_by(WecomContact.id.desc()).limit(int(args.get("limit", 10))))
    ).scalars().all()
    return {
        "count": len(rows),
        "contacts": [
            {
                "name": c.name,
                "mobile": c.remark_mobile,
                "tags": c.tags or [],
                "staff": c.staff_userid,
                "external_userid": c.external_userid,
            }
            for c in rows
        ],
        "scope": "wecom:read——档案范围与授权用户一致",
    }
