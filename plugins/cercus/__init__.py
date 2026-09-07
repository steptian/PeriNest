"""Cercus 尾须——企微私域插件（PeriNest 第一个标准插件，示范契约）。

能力：外部联系人镜像/回调精确刷新/每日兜底同步/侧边栏 OAuth 免登/JS-SDK 签名。
WECOM_* 未配置时自动禁用（端点 503，权限域仍在——fail-closed）。
"""
from collections.abc import Awaitable
from typing import Any

from app.core.plugins import PluginMeta

from .endpoints import router
from .tools import TOOL_DEFINITIONS, execute_tool


async def _wecom_contact_search(user, db, args: dict) -> dict:
    return await execute_tool("wecom_contact_search", user, db, args)


plugin = PluginMeta(
    name="cercus",
    label="企微私域（尾须）",
    perm_domains=["wecom"],
    routers=[router],
    mcp_tools=TOOL_DEFINITIONS,
    mcp_executors={"wecom_contact_search": _wecom_contact_search},
    celery_includes=["plugins.cercus.tasks"],
    beat_schedule={
        "cercus-daily-sync": {
            "task": "plugins.cercus.tasks.sync_all_staff",
            "schedule": {"hour": 6, "minute": 30},  # crontab 语义（celery_app 转 crontab）
        },
    },
)
