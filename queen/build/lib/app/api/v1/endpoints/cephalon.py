"""Cephalon (头部) — 用户鉴权、注册、微信登录。"""
import logging

import httpx
from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.security import create_access_token
from app.schemas.request import LoginRequest, RegisterRequest, WxLoginRequest
from app.schemas.response import TokenResponse, UserResponse
from app.services import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: DBSession):
    try:
        user = await user_service.register(db, req)
    except user_service.UserExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return user


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: DBSession):
    try:
        token = await user_service.login(db, req)
    except user_service.AuthFailedError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return TokenResponse(access_token=token)


@router.post("/wx-login", response_model=TokenResponse)
async def wx_login(req: WxLoginRequest, db: DBSession):
    """Antenna 端登录：code → openid → 自定义 Token（不透传 code）。"""
    openid = await _code2session(req.code)
    if openid is None:
        raise HTTPException(status_code=401, detail="微信登录态换取失败")
    user = await user_service.get_or_create_wx_user(db, openid)
    return TokenResponse(access_token=create_access_token(subject=str(user.id)))


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser):
    return user


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
