"""用户业务逻辑 (Queen 决策大脑 — 用户模块)。

API 层禁止编写业务 SQL，全部收敛在此层。
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.request import LoginRequest, RegisterRequest


class UserExistsError(Exception):
    """用户名已存在。"""


class AuthFailedError(Exception):
    """用户名或密码错误。"""


async def register(db: AsyncSession, req: RegisterRequest) -> User:
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none() is not None:
        raise UserExistsError(f"username '{req.username}' already taken")
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role="wing",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)  # 回读 server_default 字段(created_at 等)，避免响应序列化时 lazy IO
    return user


async def login(db: AsyncSession, req: LoginRequest) -> str:
    """校验凭据，返回 JWT access token。"""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(req.password, user.hashed_password):
        raise AuthFailedError("用户名或密码错误")
    if not user.is_active:
        raise AuthFailedError("账号已被禁用")
    return create_access_token(subject=str(user.id))


async def get_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_or_create_wx_user(db: AsyncSession, openid: str) -> User:
    """Antenna 端：按 openid 查找或创建用户。"""
    result = await db.execute(select(User).where(User.wx_openid == openid))
    user = result.scalar_one_or_none()
    if user is not None:
        return user
    user = User(
        username=f"wx_{openid[:16]}",
        hashed_password=hash_password(openid),  # 微信用户无本地密码
        role="antenna",
        wx_openid=openid,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user
