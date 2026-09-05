"""Thorax (胸部动力) — 核心交易/订单。"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, DBSession
from app.core.permissions import ORDERS, require_permission
from app.schemas.request import CreateOrderRequest
from app.schemas.response import OrderResponse
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(req: CreateOrderRequest, db: DBSession, user=Depends(require_permission(ORDERS))):
    """创建订单。Antenna 普通用户只能给自己下单。"""
    return await order_service.create_order(db, user.id, req)


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    response: "Response",
    db: DBSession,
    user=Depends(require_permission(ORDERS)),
    keyword: str = Query(default="", max_length=64),
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """订单列表。admin 可见全部，其余仅可见自己的。X-Total-Count 携带总数。"""
    from fastapi import Response as _R  # noqa: F401

    user_id = None if user.role == "admin" else user.id
    orders, total = await order_service.list_orders(
        db, user_id=user_id, limit=limit, offset=offset, keyword=keyword, status=status
    )
    response.headers["X-Total-Count"] = str(total)
    return orders


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: DBSession, user=Depends(require_permission(ORDERS))):
    order = await order_service.get_order(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权查看该订单")
    return order
