"""Pheromone (信息素) — Celery 应用实例。

耗时任务（导出报表、批量推送）走此通道，与 Queen 主进程解耦。
"""
from celery import Celery
from celery.schedules import crontab

from app.core import plugins
from app.core.config import settings

# 插件 seam：celery include + beat 动态挂载（插件声明，内核不知细节）
_plugin_includes: list[str] = []
_plugin_beat: dict = {}
for _meta in plugins.discover().values():
    _plugin_includes.extend(_meta.celery_includes)
    for _key, _entry in _meta.beat_schedule.items():
        _sched = _entry["schedule"]
        _entry = {**_entry, "schedule": crontab(**_sched) if isinstance(_sched, dict) else _sched}
        _plugin_beat[_key] = _entry

celery_app = Celery(
    "perinest",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.email_tasks", "app.tasks.report_tasks", "app.tasks.ai_tasks",
        *_plugin_includes,
    ],
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
    beat_schedule=_plugin_beat,
)
