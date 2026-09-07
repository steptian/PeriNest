"""PeriNest 插件契约——内核薄、业务模块按契约生长（dsh ctx-seam 模式）。

内核只暴露四个挂载点（seam），不知道任何插件的内部：
1. 路由 seam：PluginMeta.routers → 启动时 include
2. 权限域 seam：PluginMeta.perm_domains → 并入鉴权体系（admin 恒全量）
3. 工具 seam：PluginMeta.mcp_tools + mcp_executors → MCP tools/list + agent 工具面
   （parity 测试自动对账——共生体原则的注册表天然是插件挂载点）
4. 迁移 seam：plugins/<name>/versions/ → alembic version_locations 动态挂载

启用：settings.PLUGINS（env PERINEST_Q_PLUGINS，逗号分隔；默认 cercus）。
新业务插件先进 plugins/experimental/（默认不装、发布排除、稳定区禁止依赖
——dsh 机械隔离模式；experimental 不降质量标准，测试照跑）。
"""
import sys
from dataclasses import dataclass, field
from collections.abc import Awaitable, Callable
from pathlib import Path

# monorepo 源码部署：plugins 包在仓库根（queen 外），注入 sys.path
# （独立 pip 分发是 v2 议题——见 plugins/README.md）
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


@dataclass(frozen=True)
class PluginMeta:
    """一个插件的挂载声明（plugins/<name>/__init__.py 里导出 plugin 变量）。"""

    name: str  # 目录名（唯一）
    label: str  # 显示名
    perm_domains: list[str] = field(default_factory=list)  # 权限域（如 ["wecom"]）
    routers: list = field(default_factory=list)  # APIRouter 实例列表
    mcp_tools: list[dict] = field(default_factory=list)  # MCP 工具声明（spiracle 同构）
    # 工具执行器：async (user, db, args) -> dict（返回 _text 载荷 dict）
    mcp_executors: dict[str, Callable[..., Awaitable[dict]]] = field(default_factory=dict)
    celery_includes: list[str] = field(default_factory=list)  # celery worker import 路径
    beat_schedule: dict = field(default_factory=dict)  # celery beat 条目
    experimental: bool = False  # experimental 区标记（README 政策用）


def _load(name: str) -> PluginMeta | None:
    """import plugins.<name> 并取其 plugin 变量；失败返回 None（带日志）。"""
    import structlog

    logger = structlog.get_logger(__name__)
    try:
        module = __import__(f"plugins.{name}", fromlist=["plugin"])
        meta = getattr(module, "plugin", None)
        if not isinstance(meta, PluginMeta):
            logger.warning("plugin_invalid", name=name, reason="缺少 plugin: PluginMeta")
            return None
        if meta.name != name:
            logger.warning("plugin_name_mismatch", declared=meta.name, dir_name=name)
            return None
        return meta
    except Exception as e:  # noqa: BLE001 — 插件加载失败不炸内核，禁用即降级
        logger.error("plugin_load_failed", name=name, error=str(e)[:300])
        return None


_cache: dict | None = None


def discover() -> dict[str, PluginMeta]:
    """按 settings.PLUGINS 加载已启用插件（进程内缓存）。"""
    global _cache
    if _cache is not None:
        return _cache
    from app.core.config import settings

    enabled = {p.strip() for p in settings.PLUGINS.split(",") if p.strip()}
    loaded: dict[str, PluginMeta] = {}
    for name in sorted(enabled):
        meta = _load(name)
        if meta is not None:
            loaded[name] = meta
    _cache = loaded
    return loaded


def plugin_perm_domains() -> list[str]:
    """已启用插件的权限域合集（permissions.ALL_PERMS 动态部分）。"""
    return [d for m in discover().values() for d in m.perm_domains]
