"""Redis 连接池 (Nectar 花蜜采集)。

应用生命周期内复用连接池，FastAPI startup/shutdown 时调用 init/close。
"""
import redis.asyncio as aioredis

from app.core.config import settings

_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    """FastAPI lifespan 启动时调用。"""
    global _redis
    _redis = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
    )


async def close_redis() -> None:
    """FastAPI lifespan 关闭时调用。"""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    """获取共享 Redis 客户端。未初始化时抛错，避免静默降级。"""
    if _redis is None:
        raise RuntimeError("Redis not initialized; call init_redis() at startup")
    return _redis
