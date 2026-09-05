"""Crop embedding 服务（双模：真 API / mock 伪向量）。

与 Nerve 同哲学：EMBEDDING_API_KEY 留空自动 mock——
哈希伪向量是确定性的（同词必同向量），demo/CI 零成本跑通全链路。
"""
import hashlib
import math
import os

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


def _hash_embed(text: str, dim: int) -> list[float]:
    """确定性伪向量：词哈希分桶叠加 + L2 归一化。

    没有语义泛化能力（"电脑"召不回"计算机"），但相同词必召回——
    demo 与 CI 验证检索链路足够，且结果可复现（测试稳定）。
    """
    vec = [0.0] * dim
    for token in _tokenize(text):
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        vec[h % dim] += 1.0
        vec[(h >> 16) % dim] += 0.5  # 每词扰动两个桶，降低碰撞平坦化
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _tokenize(text: str) -> list[str]:
    """简易中英分词：英文按词、中文按 2-gram。"""
    import re

    tokens: list[str] = []
    for word in re.findall(r"[A-Za-z0-9_]+", text):
        tokens.append(word.lower())
    cjk = re.findall(r"[\u4e00-\u9fff]+", text)
    for seg in cjk:
        tokens.extend(seg[i : i + 2] for i in range(len(seg) - 1))
    return tokens


# 分批 + 并发（借鉴 ack-agent 生产实测：并发 5 提速约 4 倍）。
# BATCH_MAX 对齐 DashScope 硬限制（实测 >10 报错）；OpenAI 官方可放宽。
_EMBED_BATCH_MAX = int(os.environ.get("EMBEDDING_BATCH_MAX", "10"))
_EMBED_CONCURRENCY = int(os.environ.get("EMBEDDING_CONCURRENCY", "4"))


async def _embed_batch(client: httpx.AsyncClient, batch: list[str]) -> list[list[float]]:
    """单批请求。响应按 index 排序还原顺序（OpenAI 兼容规范 data[].index）。"""
    cfg = await AiRuntimeConfig.embedding()
    resp = await client.post(
        f"{cfg['base'].rstrip('/')}/embeddings",
        headers={"Authorization": f"Bearer {cfg['key']}"},
        json={"model": cfg["model"], "input": batch},
    )
    resp.raise_for_status()
    data = sorted(resp.json()["data"], key=lambda item: item["index"])
    vectors = [item["embedding"] for item in data]
    if len(vectors) != len(batch):
        raise ValueError(f"embedding 数量不匹配: {len(vectors)} != {len(batch)}")
    return vectors


async def embed_texts(texts: list[str]) -> tuple[list[list[float]], bool]:
    """批量 embedding（分批+并发）。返回 (向量列表, 是否 mock)。"""
    from app.services.runtime_config import AiRuntimeConfig

    cfg = await AiRuntimeConfig.embedding()
    if settings.EMBEDDING_MOCK or not cfg["key"]:
        return [_hash_embed(t, cfg["dim"]) for t in texts], True

    import asyncio

    try:
        sem = asyncio.Semaphore(_EMBED_CONCURRENCY)
        batches = [texts[i : i + _EMBED_BATCH_MAX] for i in range(0, len(texts), _EMBED_BATCH_MAX)]
        results: list[list[list[float]]] = [[] for _ in batches]

        async with httpx.AsyncClient(
            timeout=settings.EMBEDDING_TIMEOUT_SECONDS
        ) as client:

            async def run(i: int, batch: list[str]) -> None:
                async with sem:
                    results[i] = await _embed_batch(client, batch)

            await asyncio.gather(*(run(i, b) for i, b in enumerate(batches)))
        return [vec for batch in results for vec in batch], False
    except Exception:
        # fail 透明：真 embedding 挂了不静默降级（否则线上悄悄变伪向量，
        # 检索质量无声劣化）——记日志后抛出，由调用方落 failed 状态
        logger.exception("crop_embed_failed", model=settings.EMBEDDING_MODEL)
        raise


def pack_vector(vec: list[float]) -> bytes:
    """float32 打包（MySQL BLOB 与 Redis VADD FP32 共用格式）。"""
    import struct

    return struct.pack(f"{len(vec)}f", *vec)
