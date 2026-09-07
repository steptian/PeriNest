"""Crop 批量入库任务（走 Pheromone 信息素通道）。

批量上传 = 端点只做「提取文本 + 建 queued 文档行」立即返回；
向量化消化由本 task 串行执行（单 task 内 for 循环逐文档）——
同 ack-agent 的串行 worker 哲学：避免并发 embedding 压垮 embedding API /
Redis 写入冲突。单文档失败只标 failed 继续下一个，不炸整批。

digest_documents 为 async 主逻辑（测试直接 await）；task 层仅 asyncio.run 桥接
（Celery worker 内无事件循环）。
"""
import asyncio

from app.models.crop import CropDocument
from app.tasks.celery_app import celery_app


async def digest_documents(doc_ids: list[int]) -> dict:
    """逐文档 ingest（queued → embedding → ready/failed）。"""
    from app.core.database import AsyncSessionLocal
    from app.services import crop_service

    results: dict[str, int] = {"ok": 0, "failed": 0}
    async with AsyncSessionLocal() as db:
        for doc_id in doc_ids:
            try:
                await crop_service.ingest_document(db, doc_id)
                await db.commit()
                results["ok"] += 1
            except Exception:
                # ingest_document 已把 doc 标 failed + error；回滚重开提交失败态，继续下一个
                await db.rollback()
                async with AsyncSessionLocal() as db2:
                    doc = await db2.get(CropDocument, doc_id)
                    if doc is not None and doc.status != "ready":
                        doc.status = "failed"
                        if not doc.error:
                            doc.error = "批量消化失败（见服务日志）"
                        await db2.commit()
                results["failed"] += 1
    return results


@celery_app.task(name="crop.ingest_batch", bind=True)
def crop_ingest_batch(self, doc_ids: list[int]) -> dict:
    """Celery 入口：批量消化（worker 内无事件循环，asyncio.run 桥接）。"""
    try:
        return asyncio.run(digest_documents(doc_ids))
    except Exception as exc:  # 整批级异常（罕见）：保留失败态，task 失败可重试
        self.retry(countdown=10, max_retries=2, exc=exc)
