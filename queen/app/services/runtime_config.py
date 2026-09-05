"""运行时配置服务——AI/embedding 的 key/model/base 抽象层。

优先级：pn_sys_config（DB）> .env。管理端改配置即时生效（内存缓存，
写入时失效）。敏感 key 对外一律打码。
"""
import structlog
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.sys_config import SysConfig

logger = structlog.get_logger(__name__)

# 允许管理端配置的键白名单（fail-closed：不在名单的键拒绝写入）
AI_CONFIG_KEYS = {
    "ai.api_base": "AI_API_BASE",
    "ai.api_key": "AI_API_KEY",
    "ai.model": "AI_MODEL",
    "ai.timeout": "AI_TIMEOUT_SECONDS",
    "embedding.api_base": "EMBEDDING_API_BASE",
    "embedding.api_key": "EMBEDDING_API_KEY",
    "embedding.model": "EMBEDDING_MODEL",
    "embedding.dim": "EMBEDDING_DIM",
    # Cercus 尾须（企微私域）——归拢进同一配置面（DB > env）
    "wecom.corp_id": "WECOM_CORP_ID",
    "wecom.corp_secret": "WECOM_CORP_SECRET",
    "wecom.agent_id": "WECOM_AGENT_ID",
    "wecom.token": "WECOM_TOKEN",
    "wecom.aes_key": "WECOM_ENCODING_AES_KEY",
    "wecom.sync_staff": "WECOM_SYNC_STAFF",
}
# 响应中必须打码的键
SENSITIVE_KEYS = {"ai.api_key", "embedding.api_key", "wecom.corp_secret", "wecom.aes_key"}
# 数值型键（int 转换）
_NUMERIC_KEYS = {"ai.timeout", "embedding.dim", "wecom.agent_id"}

_cache: dict = {"values": {}, "loaded": False}


def _mask(value: str) -> str:
    if len(value) <= 10:
        return "***"
    return f"{value[:6]}***{value[-4:]}"


async def _load(db) -> dict[str, str]:
    rows = (await db.execute(select(SysConfig))).scalars().all()
    return {r.key: r.value for r in rows if r.key in AI_CONFIG_KEYS and r.value}


async def get_overrides() -> dict[str, str]:
    """DB 覆盖值（缓存）。独立短连接——高频读取不吃业务连接池。"""
    if _cache["loaded"]:
        return _cache["values"]
    async with AsyncSessionLocal() as db:
        _cache.update(values=await _load(db), loaded=True)
    return _cache["values"]


def invalidate_cache() -> None:
    _cache.update(values={}, loaded=False)


async def resolve(key: str):
    """解析一个配置项：DB > .env。key 形如 'ai.api_key'。"""
    env_attr = AI_CONFIG_KEYS.get(key)
    if env_attr is None:
        raise KeyError(f"未知配置键: {key}")
    overrides = await get_overrides()
    if key in overrides:
        raw = overrides[key]
    else:
        raw = getattr(settings, env_attr)
    # 数值型转换
    if key in _NUMERIC_KEYS:
        try:
            return int(raw)
        except (TypeError, ValueError):
            return getattr(settings, env_attr)
    return raw


class AiRuntimeConfig:
    """ai/embedding/wecom 服务消费的动态视图。"""

    @staticmethod
    async def wecom() -> dict:
        return {
            "corp_id": await resolve("wecom.corp_id"),
            "corp_secret": await resolve("wecom.corp_secret"),
            "agent_id": await resolve("wecom.agent_id"),
            "token": await resolve("wecom.token"),
            "aes_key": await resolve("wecom.aes_key"),
            "sync_staff": await resolve("wecom.sync_staff"),
        }

    @staticmethod
    async def wecom_configured() -> bool:
        c = await AiRuntimeConfig.wecom()
        return bool(c["corp_id"] and c["corp_secret"] and c["agent_id"])

    @staticmethod
    async def ai() -> dict:
        return {
            "base": await resolve("ai.api_base"),
            "key": await resolve("ai.api_key"),
            "model": await resolve("ai.model"),
            "timeout": await resolve("ai.timeout"),
        }

    @staticmethod
    async def embedding() -> dict:
        return {
            "base": await resolve("embedding.api_base"),
            "key": await resolve("embedding.api_key"),
            "model": await resolve("embedding.model"),
            "dim": await resolve("embedding.dim"),
        }


async def read_all_masked() -> list[dict]:
    """管理端读视图：当前生效值 + 来源 + 打码。"""
    overrides = await get_overrides()
    out = []
    for key, env_attr in AI_CONFIG_KEYS.items():
        raw = await resolve(key)
        out.append(
            {
                "key": key,
                "value": _mask(str(raw)) if key in SENSITIVE_KEYS else str(raw),
                "source": "db" if key in overrides else "env",
            }
        )
    return out


async def write(updates: dict[str, str], updated_by: str) -> dict:
    """管理端写入（白名单校验 + 空值=删除覆盖回落 env）。"""
    import datetime

    invalid = set(updates) - set(AI_CONFIG_KEYS)
    if invalid:
        raise ValueError(f"非法配置键: {sorted(invalid)}")
    written = []
    async with AsyncSessionLocal() as db:
        for key, value in updates.items():
            row = await db.get(SysConfig, key)
            if value == "":  # 清空 = 回落 env
                if row:
                    await db.delete(row)
                written.append({"key": key, "action": "reset_env"})
                continue
            if row:
                row.value = value
                row.updated_by = updated_by
            else:
                db.add(SysConfig(key=key, value=value, updated_by=updated_by))
            written.append({"key": key, "action": "set"})
        await db.commit()
    invalidate_cache()
    # 企微凭证变更 → 失效共享 token 缓存（旧 secret 的 token 立即作废）
    if any(k.startswith("wecom.") for k in updates):
        try:
            from app.services import wecom_service as _ws

            await _ws._redis().delete("cercus:token")
            for t in ("corp", "agent"):
                await _ws._redis().delete(f"cercus:jsapi_ticket:{t}")
        except Exception:
            pass
    logger.info("runtime_config_updated", keys=list(updates), by=updated_by)
    return {"written": written}
