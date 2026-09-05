"""Cercus 尾须异步任务（Pheromone 信息素通道）。

- sync_all_staff：全量同步（手动触发或每日 beat 兜底）
- 企微未配置时任务直接返回 skipped（worker 不炸）
"""
import asyncio
import datetime

import structlog

from app.tasks.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task
def sync_all_staff(staff_userids: list[str] | None = None) -> dict:
    """同步企微客户镜像。

    staff_userids 为空时：取镜像表已有 staff 集合 ∪ 配置的种子员工
    （WECOM_SYNC_STAFF，逗号分隔）——首次部署靠种子，之后靠存量扩散。
    """
    from sqlalchemy import select

    from app.core.config import settings
    from app.core.database import AsyncSessionLocal
    from app.models.wecom import WecomContact
    from app.services import wecom_service

    async def _run() -> dict:
        if not settings.wecom_enabled:
            return {"ok": False, "skipped": "wecom disabled"}
        async with AsyncSessionLocal() as db:
            if not staff_userids:
                seeds = [s.strip() for s in settings.WECOM_SYNC_STAFF.split(",") if s.strip()]
                existing = (
                    await db.execute(select(WecomContact.staff_userid).distinct())
                ).scalars().all()
                staff_userids = sorted(set(seeds) | set(existing))
            total = 0
            for staff in staff_userids:
                try:
                    rows = await wecom_service.sync_contacts_for_staff(staff)
                except Exception as e:
                    logger.warning("cercus_sync_staff_failed", staff=staff, error=str(e))
                    continue
                for r in rows:
                    contact = (
                        await db.execute(
                            select(WecomContact).where(
                                WecomContact.external_userid == r["external_userid"]
                            )
                        )
                    ).scalar_one_or_none()
                    if contact is None:
                        db.add(WecomContact(**r))
                    else:  # 镜像字段刷新，tags/kv 运营扩展不动
                        for k in ("name", "unionid", "avatar", "remark_mobile", "staff_userid", "synced_at"):
                            setattr(contact, k, r[k])
                        total += 1
                await db.commit()
            from app.services import wecom_service as _ws

            await _ws.invalidate_contact_cache()  # 全量后失效详情缓存
            logger.info("cercus_sync_done", staffs=len(staff_userids), contacts=total)
            return {"ok": True, "staffs": len(staff_userids), "contacts": total}

    return asyncio.run(_run())
