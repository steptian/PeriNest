"""Cephalon (头部) — 用户鉴权、注册、微信登录、用户管理(RBAC)。"""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.permissions import (
    AI,
    USERS,
    effective_permissions,
    require_permission,
)
from app.core.security import create_access_token
from app.models.perm_override import PermOverride
from app.models.user import User
from app.schemas.request import LoginRequest, RegisterRequest, WxLoginRequest
from app.schemas.response import TokenResponse, UserResponse
from app.services import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: DBSession):
    try:
        user = await user_service.register(db, req)
    except user_service.UserExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return user


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: DBSession, request: Request):
    try:
        token = await user_service.login(db, req)
    except user_service.AuthFailedError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    # 登录留痕（失败不阻断登录）
    from sqlalchemy import select

    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if user:
        await user_service.record_login(
            db, user, request.headers.get("x-forwarded-for") or request.client.host if request.client else None
        )
    return TokenResponse(access_token=token)


@router.post("/wx-login", response_model=TokenResponse)
async def wx_login(req: WxLoginRequest, db: DBSession):
    openid = await _code2session(req.code)
    if openid is None:
        raise HTTPException(status_code=401, detail="微信登录态换取失败")
    user = await user_service.get_or_create_wx_user(db, openid)
    return TokenResponse(access_token=create_access_token(subject=str(user.id)))


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser):
    return user


@router.get("/me/permissions")
async def my_permissions(user: CurrentUser, db: DBSession) -> dict:
    """我的最终权限（角色 ⊕ 账号覆盖）。前端按此渲染菜单。"""
    return {"role": user.role, "permissions": await effective_permissions(user, db)}


roles_router = APIRouter(prefix="/roles", tags=["roles"])


@roles_router.get("")
async def list_roles(
    _admin: User = Depends(require_permission(f"{USERS}:read")),
) -> dict:
    """角色×权限矩阵总览（只读——矩阵是代码级事实源，变更走 git，不走 UI）。"""
    from app.core.permissions import ALL_PERMS, ROLE_NAMES, ROLE_PERMISSIONS

    return {
        "domains": ALL_PERMS,
        "roles": [
            {
                "role": r,
                "name": ROLE_NAMES.get(r, r),
                "permissions": perms,
                "locked": r == "admin",
            }
            for r, perms in ROLE_PERMISSIONS.items()
        ],
    }


# ---------- 用户管理（admin 写 / operator 读） ----------

class UserRoleRequest(BaseModel):
    role: str


class UserStatusRequest(BaseModel):
    is_active: bool


class PermOverrideRequest(BaseModel):
    perm: str
    effect: str  # grant / deny


@admin_router.get("", response_model=list[UserResponse])
async def list_users(
    response: "Response",
    db: DBSession,
    _admin: User = Depends(require_permission(f"{USERS}:read")),
    keyword: str = Query(default="", max_length=64),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    users, total = await user_service.list_users(db, keyword, limit, offset, is_active)
    response.headers["X-Total-Count"] = str(total)  # 分页元数据走响应头
    return [UserResponse.model_validate(u) for u in users]




class UserUpdateRequest(BaseModel):
    email: str | None = None


class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    role: str = "wing"


@admin_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: UserCreateRequest,
    db: DBSession,
    admin: User = Depends(require_permission(f"{USERS}:write")),
):
    """管理员新增用户（角色可控）。"""
    from app.schemas.request import RegisterRequest

    try:
        user = await user_service.register(
            db, RegisterRequest(username=req.username, password=req.password, email=req.email)
        )
    except user_service.UserExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    if req.role != "wing":
        try:
            user = await user_service.update_user_role(db, user, req.role, admin)
        except (ValueError, PermissionError) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    await db.refresh(user)
    from app.models.sys_log import SysLog
    db.add(SysLog(user_id=admin.id, level="WARN", source="rbac",
                  message=f"新增用户 {user.username}（角色 {user.role}）"))
    await db.flush()
    return user


@admin_router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: DBSession,
    _admin: User = Depends(require_permission(f"{USERS}:read")),
):
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@admin_router.get("/{user_id}/permissions")
async def get_user_permissions(
    user_id: int,
    db: DBSession,
    _admin: User = Depends(require_permission(f"{USERS}:read")),
) -> dict:
    """权限全景：角色模板 + 账号覆盖明细 + 最终权限。"""
    from app.core.permissions import base_permissions
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    overrides = (
        await db.execute(select(PermOverride).where(PermOverride.user_id == user_id))
    ).scalars().all()
    return {
        "user_id": user.id,
        "role": user.role,
        "base_permissions": base_permissions(user.role),
        "overrides": [{"perm": o.perm, "effect": o.effect} for o in overrides],
        "permissions": await effective_permissions(user, db),
    }


@admin_router.delete("/{user_id}/perms/{perm}")
async def delete_perm_override(
    user_id: int,
    perm: str,
    db: DBSession,
    admin: User = Depends(require_permission(f"{USERS}:write")),
) -> dict:
    """删除单条账号级覆盖（恢复角色模板默认）。"""
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.execute(
        delete(PermOverride).where(
            PermOverride.user_id == user_id, PermOverride.perm == perm
        )
    )
    await db.flush()
    from app.models.sys_log import SysLog
    db.add(SysLog(user_id=admin.id, level="WARN", source="rbac",
                  message=f"删除用户 {user.username} 权限覆盖 {perm}"))
    await db.flush()
    return {"user_id": user_id, "perm": perm, "deleted": True}


@admin_router.patch("/{user_id}", response_model=UserResponse)
async def update_user_profile(
    user_id: int,
    req: UserUpdateRequest,
    db: DBSession,
    _admin: User = Depends(require_permission(f"{USERS}:write")),
):
    """编辑成员基本资料（邮箱）。"""
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if req.email is not None:
        user.email = req.email
        db.add(user)
        await db.flush()
    await db.refresh(user)
    return user


@admin_router.patch("/{user_id}/role", response_model=UserResponse)
async def set_role(
    user_id: int,
    req: UserRoleRequest,
    db: DBSession,
    admin: User = Depends(require_permission(f"{USERS}:write")),
):
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    try:
        return await user_service.update_user_role(db, user, req.role, admin)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@admin_router.patch("/{user_id}/status", response_model=UserResponse)
async def set_status(
    user_id: int,
    req: UserStatusRequest,
    db: DBSession,
    admin: User = Depends(require_permission(f"{USERS}:write")),
):
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    try:
        return await user_service.set_user_status(db, user, req.is_active, admin)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@admin_router.put("/{user_id}/perms")
async def set_perm_override(
    user_id: int,
    req: PermOverrideRequest,
    db: DBSession,
    admin: User = Depends(require_permission(f"{USERS}:write")),
) -> dict:
    """账号级权限覆盖（grant/deny）。仅非 admin 账号可设置。"""
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="admin 账号权限锁死，不可覆盖")
    if req.effect not in ("grant", "deny"):
        raise HTTPException(status_code=422, detail="effect 必须是 grant 或 deny")
    # 同点位先删后写（幂等覆盖）
    await db.execute(
        delete(PermOverride).where(
            PermOverride.user_id == user_id, PermOverride.perm == req.perm
        )
    )
    db.add(PermOverride(user_id=user_id, perm=req.perm, effect=req.effect, created_by=admin.id))
    await db.flush()
    from app.models.sys_log import SysLog
    db.add(SysLog(user_id=admin.id, level="WARN", source="rbac",
                  message=f"用户 {user.username} 权限覆盖 {req.effect} {req.perm}"))
    await db.flush()
    return {"user_id": user_id, "perm": req.perm, "effect": req.effect}


async def _code2session(code: str) -> str | None:
    """调微信 jscode2session 换 openid。"""
    if not settings.WX_APPID:
        logger.warning("WX_APPID 未配置，wx-login 不可用")
        return None
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WX_APPID,
        "secret": settings.WX_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        data = resp.json()
    if data.get("errcode"):
        logger.error("jscode2session failed: %s", data)
        return None
    return data.get("openid")
