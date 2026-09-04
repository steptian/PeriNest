"""Pheromone (信息素) — Celery 应用实例。

耗时任务（导出报表、批量推送）走此通道，与 Queen 主进程解耦。
"""
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "perinest",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.email_tasks", "app.tasks.report_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    # worker 崩溃自动重启（断头再生）
    worker_max_tasks_per_child=500,
)
