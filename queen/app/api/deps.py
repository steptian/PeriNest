"""FastAPI 依赖注入：DB Session、当前用户。"""
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.services import user_service

DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DBSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """从 Authorization: Bearer {token} 解析当前用户。Wing/Antenna 通用。"""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise credentials_exc
    token = authorization.removeprefix("Bearer ").strip()
    subject = decode_access_token(token)
    if subject is None:
        raise credentials_exc
    try:
        user_id = int(subject)
    except ValueError:
        raise credentials_exc from None
    user = await user_service.get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise credentials_exc
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
