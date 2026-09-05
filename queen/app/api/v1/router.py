"""v1 路由注册总入口。"""
from fastapi import APIRouter

from app.api.v1.endpoints import abdomen, cercus, cephalon, crop, nerve, spiracle, thorax

api_router = APIRouter()
api_router.include_router(cephalon.router)
api_router.include_router(cephalon.admin_router)
api_router.include_router(cephalon.roles_router)
api_router.include_router(thorax.router)
api_router.include_router(abdomen.router)
api_router.include_router(nerve.router)
api_router.include_router(spiracle.router)
api_router.include_router(crop.router)
api_router.include_router(cercus.router)
