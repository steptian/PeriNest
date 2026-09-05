"""Abdomen (腹部) — 系统日志、用户反馈、附件。"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DBSession, get_db
from app.core.permissions import FEEDBACK, require_permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["abdomen"])




@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def submit_feedback(payload: dict, db: DBSession, user=Depends(require_permission(FEEDBACK))):
    """提交反馈。骨架阶段直接落 pn_sys_log 表，正式版拆独立表。"""
    from sqlalchemy import text

    content = str(payload.get("content", "")).strip()
    if len(content) < 5:
        raise HTTPException(status_code=422, detail="反馈内容至少 5 个字符")
    await db.execute(
        text(
            "INSERT INTO pn_sys_log (user_id, level, source, message) "
            "VALUES (:uid, 'INFO', 'feedback', :msg)"
        ),
        {"uid": user.id, "msg": content},
    )
    return {"ok": True}


@router.get("/healthz", include_in_schema=False)
async def healthz():
    """存活探针（K8s/Nginx check 用）。"""
    return {"status": "ok"}
