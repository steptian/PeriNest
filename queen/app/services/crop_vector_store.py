"""Crop 向量投影（Redis 8 Vector Sets — Nectar 花蜜）。

权威/投影分离：本类只操作投影，权威在 MySQL pn_crop_chunk.embedding。
Redis 清空/升级/换 embedding 模型 → rebuild() 从 MySQL 重建，永远可丢弃。

Vector Set 协议（Redis 8.2+，brew redis 8.x 原生内置）:
    VADD <key> FP32 <packed_bytes> <element>
    VSIM <key> FP32 <packed_bytes> WITHSCORES COUNT <n>
    VDIM / VCARD / VREM <key> <element>

注意：走独立连接（decode_responses=False）——主连接池 decode_responses=True
会破坏二进制向量传输。
"""
import redis.asyncio as aioredis
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

VECTOR_KEY = "crop:vs"  # 全库一个 vector set，element = chunk_id


def _client() -> aioredis.Redis:
    """二进制安全连接（不复用 decode_responses=True 的主池）。"""
    return aioredis.from_url(settings.REDIS_URL, decode_responses=False)


async def add(chunk_id: int, packed: bytes) -> None:
    """投影一个 chunk 向量。"""
    r = _client()
    try:
        await r.execute_command("VADD", VECTOR_KEY, "FP32", packed, str(chunk_id))
    finally:
        await r.aclose()


async def search(packed: bytes, top_k: int) -> list[tuple[int, float]]:
    """KNN 检索。返回 [(chunk_id, cosine_similarity)]，按相似度降序。"""
    r = _client()
    try:
        raw = await r.execute_command(
            "VSIM", VECTOR_KEY, "FP32", packed, "WITHSCORES", "COUNT", str(top_k)
        )
    finally:
        await r.aclose()
    # 响应形态：[[element, score], ...]（RESP2）或 dict（RESP3）
    if isinstance(raw, dict):
        pairs = list(raw.items())
    else:
        pairs = [(row[0], row[1]) for row in raw]
    return [(int(elem), float(score)) for elem, score in pairs]


async def drop_chunk(chunk_id: int) -> None:
    r = _client()
    try:
        await r.execute_command("VREM", VECTOR_KEY, str(chunk_id))
    finally:
        await r.aclose()


async def rebuild(chunk_rows: list[tuple[int, bytes]]) -> int:
    """从 MySQL 权威重建投影。chunk_rows = [(chunk_id, packed_embedding)]。

    幂等：先 DEL 整个 set 再重灌。并发检索在重建瞬间会得到空结果——
    demo 规模可接受（重建毫秒级），不做双 set 原子切换（勿增实体）。
    """
    r = _client()
    try:
        await r.delete(VECTOR_KEY)
        pipe = r.pipeline(transaction=False)
        for chunk_id, packed in chunk_rows:
            pipe.execute_command("VADD", VECTOR_KEY, "FP32", packed, str(chunk_id))
        await pipe.execute()
        await r.execute_command("VDIM", VECTOR_KEY)  # 触发维度校验（空 set 时为 0）
    finally:
        await r.aclose()
    logger.info("crop_vector_rebuild", count=len(chunk_rows))
    return len(chunk_rows)


async def card() -> int:
    """投影内向量数（健康观测用）。"""
    r = _client()
    try:
        n = await r.execute_command("VCARD", VECTOR_KEY)
        return int(n)
    except Exception:
        return 0
    finally:
        await r.aclose()
