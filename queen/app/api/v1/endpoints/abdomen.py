"""Abdomen (腹部) — 系统日志、用户反馈、附件。"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, DBSession, get_db
from app.models.user import User
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


class AiConfigUpdate(BaseModel):
    """白名单键 + 值；空串=删除覆盖回落 env。"""
    updates: dict[str, str] = Field(min_length=1)


@router.get("/system/ai-config")
async def read_ai_config(user: User = Depends(require_permission("system"))):
    """AI/embedding 运行时配置（DB>env），敏感 key 打码。"""
    from app.services import runtime_config as rc

    return {"configs": await rc.read_all_masked()}


@router.put("/system/ai-config")
async def write_ai_config(
    req: AiConfigUpdate,
    user: User = Depends(require_permission("system")),
):
    """更新运行时配置（白名单校验，即时生效）。"""
    from app.services import runtime_config as rc

    try:
        result = await rc.write(req.updates, f"admin:{user.username}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.post("/system/ai-config/test")
async def test_ai_config(user: User = Depends(require_permission("system"))):
    """用当前生效配置发一条测试消息（验证 key/model 可用）。"""
    from app.services import runtime_config as rc
    from app.services.ai_service import ai_service

    cfg = await rc.AiRuntimeConfig.ai()
    try:
        reply = await ai_service.chat([{"role": "user", "content": "配置测试：请回复 OK"}])
        return {"ok": True, "model": cfg["model"], "reply_preview": reply[:80]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"配置不可用: {e}")


@router.get("/healthz", include_in_schema=False)
async def healthz():
    """存活探针（K8s/Nginx check 用）。"""
    return {"status": "ok"}


@router.get("/system/version")
async def system_version(user: CurrentUser):
    """版本说明（版本号 + 更新记录）——四端 UI 统一数据源。

    唯一源：仓库根 CHANGELOG.md（登录即可见，无权限域：
    版本号已由 perinest_health MCP 工具覆盖，本端点供 UI 展示）。
    """
    from app.services.system_service import get_version_info

    return get_version_info()
