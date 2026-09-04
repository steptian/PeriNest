"""AI 异步任务（走 Pheromone 信息素通道，长文本处理不阻塞主链路）。"""
import asyncio

from app.tasks.celery_app import celery_app


@celery_app.task
def batch_summarize(texts: list[str], max_len: int = 200) -> dict:
    """批量摘要。Celery worker 内无事件循环，用 asyncio.run 桥接。"""
    from app.services.ai_service import ai_service

    async def _run():
        results = []
        for t in texts:
            content = await ai_service.chat([
                {"role": "system", "content": f"用不超过{max_len}字总结以下内容"},
                {"role": "user", "content": t},
            ])
            results.append(content)
        return results

    summaries = asyncio.run(_run())
    return {"ok": True, "count": len(summaries), "summaries": summaries}
