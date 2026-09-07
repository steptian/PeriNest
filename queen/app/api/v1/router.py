"""v1 路由注册总入口——内核路由静态，插件路由经 seam 动态挂载。"""
from fastapi import APIRouter

from app.api.v1.endpoints import abdomen, cephalon, crop, nerve, spiracle, thorax
from app.core import plugins

api_router = APIRouter()
api_router.include_router(cephalon.router)
api_router.include_router(cephalon.admin_router)
api_router.include_router(cephalon.roles_router)
api_router.include_router(thorax.router)
api_router.include_router(abdomen.router)
api_router.include_router(nerve.router)
api_router.include_router(spiracle.router)
api_router.include_router(crop.router)

# 插件 seam：路由（插件加载失败自动跳过，内核不炸）
for _meta in plugins.discover().values():
    for _router in _meta.routers:
        api_router.include_router(_router)
