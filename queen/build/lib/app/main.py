"""PeriNest Queen — FastAPI 入口。

启动：uvicorn app.main:app --reload（开发）
生产：gunicorn -c gunicorn.conf.py app.main:app
"""
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.redis_client import close_redis, init_redis
from app.schemas.response import HealthResponse
from app.utils.logger import logger, new_trace_id, setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(json_output=not settings.DEBUG)
    await init_redis()  # Nectar 花蜜采集启动
    logger.info("queen_startup", app=settings.APP_NAME, version=settings.APP_VERSION)
    yield
    await close_redis()
    logger.info("queen_shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="PeriNest（蜚蠊巢穴）后端核心 — Queen 执掌核心 API",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    """每个请求注入唯一 trace_id，贯穿日志链路。"""
    tid = new_trace_id()
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Trace-Id"] = tid
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        elapsed_ms=round(elapsed_ms, 2),
    )
    return response


app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health():
    """健康检查。"""
    return HealthResponse(status="ok", app=settings.APP_NAME, version=settings.APP_VERSION)
