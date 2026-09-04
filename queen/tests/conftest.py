"""pytest 全局夹具：session 级 event loop + 一次 lifespan + 共享 AsyncClient。

彻底消除跨 event loop 冲突：fixture 与测试都钉死在同一个 session loop。
"""
from collections.abc import AsyncGenerator

import httpx
import pytest_asyncio

from app.main import app


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as c:
            yield c


@pytest_asyncio.fixture(scope="function", loop_scope="session")
async def auth_headers(client: httpx.AsyncClient) -> dict:
    """注册并签发 token，返回 Authorization 头。随机后缀保证幂等。"""
    import time

    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"fx_{time.strftime('%H%M%S')}_{time.time_ns() % 10000}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db,
            RegisterRequest(
                username=uname, password="PeriNest!2026", email=f"{uname}@example.com"
            ),
        )
        await db.commit()
        token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}
