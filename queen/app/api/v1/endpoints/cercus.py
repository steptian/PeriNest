"""Cercus (尾须) — 企微私域能力端点。

- POST /cercus/sync                    手动同步企微客户（wecom:write）
- GET  /cercus/contacts                客户列表（搜索/标签过滤，wecom:read）
- GET  /cercus/contacts/{id}           详情+跟进时间线（wecom:read）
- PUT  /cercus/contacts/{id}/tags      打标签（wecom:write）
- POST /cercus/contacts/{id}/followup  添加跟进（wecom:write）
- GET  /cercus/sidebar/profile         侧边栏档案（by external_userid，wecom:read）
- GET  /cercus/wecom/jsapi-config      JS-SDK 签名（wecom:read）
- GET  /cercus/health                  模块状态（wecom:read）
- POST /cercus/callback                企微回调（免鉴权：验签即信任）
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.permissions import WECOM, require_permission
from app.models.user import User
from app.models.wecom import WecomContact, WecomFollowup
from app.services import wecom_service
from app.services.wecom_crypto import decrypt, encrypt_msg, verify

router = APIRouter(prefix="/cercus", tags=["cercus"])


class FollowupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=4000)
    next_at: str | None = None  # ISO 日期，可空
    done: bool = False


class TagsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[str] = Field(max_length=20)


def _contact_dict(c: WecomContact) -> dict:
    return {
        "id": c.id,
        "external_userid": c.external_userid,
        "staff_userid": c.staff_userid,
        "name": c.name,
        "remark_mobile": c.remark_mobile,
        "unionid": c.unionid,
        "tags": c.tags or [],
        "kv": c.kv or {},
        "synced_at": c.synced_at,
        "created_at": c.created_at,
    }


@router.post("/sync")
async def sync_contacts(
    db: DBSession,
    user: User = Depends(require_permission(WECOM)),
    staff_userid: str = Query(default="", max_length=64, description="员工 userid，空=自己"),
):
    """手动同步企微外部联系人镜像（fire-and-forget：同步失败不删本地，下次再试）。"""
    staff = staff_userid or f"staff:{user.username}"
    try:
        rows = await wecom_service.sync_contacts_for_staff(staff)
    except wecom_service.WecomDisabledError:
        raise HTTPException(status_code=503, detail="企微未配置（WECOM_* 环境变量缺失）")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"企微接口失败: {e}")

    import datetime

    for r in rows:
        existing = await db.execute(
            select(WecomContact).where(WecomContact.external_userid == r["external_userid"])
        )
        contact = existing.scalar_one_or_none()
        if contact is None:
            db.add(WecomContact(**{k: v for k, v in r.items()}))
        else:  # 镜像字段刷新，tags/kv 运营扩展不动
            contact.name = r["name"]
            contact.unionid = r["unionid"]
            contact.avatar = r["avatar"]
            contact.remark_mobile = r["remark_mobile"]
            contact.staff_userid = r["staff_userid"]
            contact.synced_at = r["synced_at"]
    await db.commit()
    return {"synced": len(rows), "staff_userid": staff}


@router.get("/contacts")
async def list_contacts(
    response: "Response",
    db: DBSession,
    _user: User = Depends(require_permission(f"{WECOM}:read")),
    keyword: str = Query(default="", max_length=64),
    tag: str = Query(default="", max_length=32),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    q = select(WecomContact)
    if keyword:
        q = q.where(
            WecomContact.name.contains(keyword)
            | WecomContact.remark_mobile.contains(keyword)
            | WecomContact.external_userid.contains(keyword)
        )
    if tag:
        q = q.where(WecomContact.tags.contains(tag))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(q.order_by(WecomContact.id.desc()).limit(limit).offset(offset))
    ).scalars().all()
    response.headers["X-Total-Count"] = str(total)
    return [_contact_dict(c) for c in rows]


@router.get("/contacts/{contact_id}")
async def get_contact(
    contact_id: int,
    db: DBSession,
    _user: User = Depends(require_permission(f"{WECOM}:read")),
):
    contact = await db.get(WecomContact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="客户不存在")
    followups = (
        await db.execute(
            select(WecomFollowup)
            .where(WecomFollowup.contact_id == contact_id)
            .order_by(WecomFollowup.created_at.desc())
        )
    ).scalars().all()
    return {
        "contact": _contact_dict(contact),
        "followups": [
            {
                "id": f.id,
                "content": f.content,
                "staff_userid": f.staff_userid,
                "next_at": f.next_at,
                "done": bool(f.done),
                "created_at": f.created_at,
            }
            for f in followups
        ],
    }


@router.put("/contacts/{contact_id}/tags")
async def update_tags(
    contact_id: int,
    req: TagsUpdate,
    db: DBSession,
    _user: User = Depends(require_permission(WECOM)),
):
    contact = await db.get(WecomContact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="客户不存在")
    contact.tags = req.tags
    await db.commit()
    return {"ok": True, "tags": contact.tags}


@router.post("/contacts/{contact_id}/followup", status_code=status.HTTP_201_CREATED)
async def add_followup(
    contact_id: int,
    req: FollowupCreate,
    db: DBSession,
    user: User = Depends(require_permission(WECOM)),
):
    contact = await db.get(WecomContact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="客户不存在")
    import datetime

    f = WecomFollowup(
        contact_id=contact_id,
        staff_userid=f"staff:{user.username}",
        content=req.content,
        next_at=datetime.datetime.fromisoformat(req.next_at) if req.next_at else None,
        done=1 if req.done else 0,
    )
    db.add(f)
    await db.commit()
    return {"ok": True, "id": f.id}


@router.get("/sidebar/profile")
async def sidebar_profile(
    db: DBSession,
    _user: User = Depends(require_permission(f"{WECOM}:read")),
    external_userid: str = Query(max_length=64),
):
    """企微侧边栏 H5 专用：按 external_userid 取档案+跟进时间线。"""
    contact = (
        await db.execute(
            select(WecomContact).where(WecomContact.external_userid == external_userid)
        )
    ).scalar_one_or_none()
    if contact is None:
        return {"contact": None, "followups": [], "hint": "未同步——先在管理端执行同步"}
    followups = (
        await db.execute(
            select(WecomFollowup)
            .where(WecomFollowup.contact_id == contact.id)
            .order_by(WecomFollowup.created_at.desc())
        )
    ).scalars().all()
    return {
        "contact": _contact_dict(contact),
        "followups": [
            {"content": f.content, "next_at": f.next_at, "done": bool(f.done), "created_at": f.created_at}
            for f in followups
        ],
    }


@router.get("/wecom/jsapi-config")
async def jsapi_config(
    _user: User = Depends(require_permission(f"{WECOM}:read")),
    url: str = Query(max_length=512),
    agent: bool = Query(default=False),
):
    try:
        return await wecom_service.make_jsapi_signature(url, agent)
    except wecom_service.WecomDisabledError:
        raise HTTPException(status_code=503, detail="企微未配置")


class WecomOauthLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=128)


@router.post("/wecom/oauth-login")
async def wecom_oauth_login(req: WecomOauthLogin, db: DBSession):
    """侧边栏 OAuth 免登：企微 code → userid → 约定式匹配系统账号。

    约定：PeriNest 用户名 == 企微员工 userid 即自动免登（零配置）；
    匹配不上返回 403（不自动建号——fail-closed，账号由管理员建）。
    """
    from fastapi import HTTPException

    from app.core.security import create_access_token
    from app.models.user import User
    from app.services import wecom_service

    try:
        userid = await wecom_service.get_userid_by_code(req.code)
    except wecom_service.WecomDisabledError:
        raise HTTPException(status_code=503, detail="企微未配置")
    if not userid:
        raise HTTPException(status_code=401, detail="code 无效或已过期")
    import json as _json

    user = (
        await db.execute(select(User).where(User.username == userid))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=403,
            detail=f"企微 userid「{userid}」未映射系统账号——请用同名用户名建号",
        )
    token = create_access_token(subject=str(user.id))
    return {
        "access_token": token,
        "username": user.username,
        "note": "侧边栏免登成功（约定：用户名=企微 userid）",
    }


@router.get("/health")
async def cercus_health(_user: CurrentUser):
    return {"module": "cercus", "wecom_enabled": settings.wecom_enabled}


@router.get("/callback", include_in_schema=False)
async def wecom_callback_echo(
    msg_signature: str = Query(default=""),
    timestamp: str = Query(default=""),
    nonce: str = Query(default=""),
    echostr: str = Query(default=""),
):
    """企微回调 URL 验证（GET）：验签→解密 echostr→原样返回明文。"""
    import structlog

    logger = structlog.get_logger(__name__)
    if not verify(settings.WECOM_TOKEN, timestamp, nonce, echostr, msg_signature):
        logger.warning("cercus_callback_echo_bad_signature")
        return "bad signature"
    try:
        return decrypt(settings.WECOM_ENCODING_AES_KEY, settings.WECOM_CORP_ID, echostr)
    except Exception:
        return "bad encrypt"


@router.post("/callback")
async def wecom_callback(
    msg_signature: str = Query(default=""),
    timestamp: str = Query(default=""),
    nonce: str = Query(default=""),
    body: dict | None = None,
):
    """企微回调：验签+解密。echo 验证返回明文；事件处理 fire-and-forget。

    dsh 教训：不建 delivery 状态机——回调处理失败只记日志，
    下次全量同步兜底（sync 是权威修复路径）。
    """
    import structlog

    logger = structlog.get_logger(__name__)
    encrypt_b64 = (body or {}).get("Encrypt", "")
    if not encrypt_b64:
        return "bad request"
    if not verify(settings.WECOM_TOKEN, timestamp, nonce, encrypt_b64, msg_signature):
        logger.warning("cercus_callback_bad_signature")
        return "bad signature"
    try:
        msg = decrypt(settings.WECOM_ENCODING_AES_KEY, settings.WECOM_CORP_ID, encrypt_b64)
    except Exception:
        logger.warning("cercus_callback_decrypt_failed")
        return "bad encrypt"
    event = json.loads(msg)
    event_type = event.get("Event")
    logger.info("cercus_callback_event", event_type=event_type, change_type=event.get("ChangeType"))

    # v2：外部联系人变更 → 精确刷新该联系人镜像（add/update/del）
    if event_type == "change_external_contact":
        eid = event.get("ExternalUserID", "")
        change = event.get("ChangeType", "")
        if eid and change in ("add", "modify", "delete"):
            await _refresh_one_contact(eid, change)
    return "ok"


async def _refresh_one_contact(external_userid: str, change: str) -> None:
    """单联系人镜像刷新（回调驱动）。失败只记日志——每日 beat 全量兜底。"""
    import structlog

    from app.core.database import AsyncSessionLocal
    from app.models.wecom import WecomContact
    from app.services import wecom_service

    logger = structlog.get_logger(__name__)
    async with AsyncSessionLocal() as db:
        contact = (
            await db.execute(
                select(WecomContact).where(WecomContact.external_userid == external_userid)
            )
        ).scalar_one_or_none()
        if change == "delete":
            if contact:  # 镜像删除；运营数据（tags/kv/跟进）保留在历史里不级联
                await db.delete(contact)
                await db.commit()
            logger.info("cercus_contact_deleted", external_userid=external_userid)
            return
        try:
            detail = await wecom_service.get_external_contact(external_userid)
        except Exception as e:
            logger.warning("cercus_refresh_failed", external_userid=external_userid, error=str(e))
            return
        info = detail.get("external_contact", {})
        remark_mobile = ""
        staff = ""
        for fu in detail.get("follow_user", []):
            staff = staff or fu.get("userid", "")
            if fu.get("remark_mobiles"):
                remark_mobile = fu["remark_mobiles"][0]
                break
        import datetime

        if contact is None:
            db.add(
                WecomContact(
                    external_userid=external_userid,
                    staff_userid=staff or "unknown",
                    name=info.get("name") or "",
                    unionid=info.get("unionid") or "",
                    avatar=info.get("avatar") or "",
                    remark_mobile=remark_mobile,
                    synced_at=datetime.datetime.now(datetime.UTC),
                )
            )
        else:
            contact.name = info.get("name") or contact.name
            contact.unionid = info.get("unionid") or contact.unionid
            contact.avatar = info.get("avatar") or contact.avatar
            if remark_mobile:
                contact.remark_mobile = remark_mobile
            if staff:
                contact.staff_userid = staff
            contact.synced_at = datetime.datetime.now(datetime.UTC)
        await db.commit()
        logger.info("cercus_contact_refreshed", external_userid=external_userid, change=change)
