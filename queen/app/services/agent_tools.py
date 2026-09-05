"""Agent 工具注册表——agentic RAG 的工具面（方案②）。

共生体原则落地：工具面 = 用户操作面。
- 每个工具绑定权限门（perm）+ service 层 handler，按请求用户权限动态下发
- REST / MCP(Spiracle) / tool-call 三方共用同一份 service（权限逻辑只写 service 层）
- 首版只挂读类工具；写操作（下单/吞入）按能力矩阵逐步开放
"""
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@dataclass(frozen=True)
class AgentTool:
    """一个可被 AI 调用的工具：JSON Schema 契约 + 权限门 + service handler。"""

    name: str
    description: str
    parameters: dict
    perm: str | None  # None = 仅要求登录
    handler: Callable[[AsyncSession, User, dict], Awaitable[dict]]

    def openai_spec(self) -> dict:
        """OpenAI tool-calls 格式的工具声明。"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


async def _crop_search(db: AsyncSession, user: User, args: dict) -> dict:
    from app.services import crop_service

    hits, mock = await crop_service.search(
        db, str(args.get("query", "")), int(args.get("top_k", 5))
    )
    return {"query": args.get("query"), "mock_embedding": mock, "hits": hits}


async def _get_me(db: AsyncSession, user: User, args: dict) -> dict:
    """AI 自知替谁工作（共生体原则）。"""
    from app.core.permissions import effective_permissions

    perms = await effective_permissions(user, db)
    return {
        "acting_as": user.username,
        "role": user.role,
        "user_id": user.id,
        "permissions": perms,
    }


def _registry() -> list[AgentTool]:
    return [
        AgentTool(
            name="crop_search",
            description=(
                "在 PeriNest 知识库（Crop 嗉囊）中语义检索，返回最相关的文档分块"
                "（含文档标题与分块序号，可作引用来源）。查询词宜短而具体；"
                "一次结果不理想可换同义词再检索。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索关键词或短语"},
                    "top_k": {
                        "type": "integer",
                        "default": 5,
                        "maximum": 10,
                        "description": "返回条数",
                    },
                },
                "required": ["query"],
            },
            perm="crop:read",
            handler=_crop_search,
        ),
        AgentTool(
            name="get_me",
            description="获取当前授权用户身份与权限——先确认自己在替谁工作。",
            parameters={"type": "object", "properties": {}},
            perm=None,
            handler=_get_me,
        ),
    ]


def tools_for_user(perms: list[str]) -> list[AgentTool]:
    """按用户有效权限过滤工具面：权限边界 = 用户边界。

    用 has_permission（域简写/全称/write 隐含 read 同语义）而非裸字符串匹配——
    admin 角色种子是域简写 "crop"，裸匹配会把 crop_search 误杀。
    """
    from app.core.permissions import has_permission

    return [t for t in _registry() if t.perm is None or has_permission(perms, t.perm)]
