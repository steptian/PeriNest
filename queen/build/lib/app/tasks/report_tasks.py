"""异步报表导出任务。"""
from app.tasks.celery_app import celery_app


@celery_app.task
def export_report(order_ids: list[int], fmt: str = "xlsx") -> dict:
    """导出订单报表。骨架阶段返回占位结果，正式版查库 + openpyxl 生成。"""
    # TODO: SQLAlchemy 同步查询 + openpyxl 导出 + 上传 OSS
    return {"ok": True, "order_count": len(order_ids), "fmt": fmt}
