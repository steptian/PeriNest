"""v1 路由注册总入口。"""
from fastapi import APIRouter

from app.api.v1.endpoints import abdomen, cephalon, nerve, thorax

api_router = APIRouter()
api_router.include_router(cephalon.router)
api_router.include_router(thorax.router)
api_router.include_router(abdomen.router)
api_router.include_router(nerve.router)
