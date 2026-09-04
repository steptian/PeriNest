"""SQLAlchemy 异步引擎与 Session 管理 (Core 腺体连接)。

- aiomysql driver + MySQL 8
- Session 生命周期由 FastAPI 依赖注入管理（见 api/deps.py）
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.db_url,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """全局 ORM 基类。所有表统一前缀 pn_，命名见各 model 的 __tablename__。"""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 依赖：请求级 Session，异常自动回滚。"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
