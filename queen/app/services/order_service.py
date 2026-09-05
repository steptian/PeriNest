"""订单业务逻辑 (Queen 决策大脑 — 订单模块)。"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderItem
from app.schemas.request import CreateOrderRequest


async def create_order(db: AsyncSession, user_id: int, req: CreateOrderRequest) -> Order:
    """创建订单并计算总额。order_no 规则：日期 + uuid 片段。"""
    total = sum(i.unit_price * i.quantity for i in req.items)
    order = Order(
        order_no=_gen_order_no(),
        user_id=user_id,
        status="pending",
        total_amount=round(total, 2),
        remark=req.remark,
    )
    db.add(order)
    await db.flush()
    for item in req.items:
        db.add(
            OrderItem(
                order_id=order.id,
                sku_name=item.sku_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
            )
        )
    await db.flush()
    await db.refresh(order)
    return order


async def list_orders(
    db: AsyncSession, user_id: int | None = None, limit: int = 20, offset: int = 0,
    keyword: str = "", status: str | None = None,
) -> tuple[list[Order], int]:
    """订单列表+总数；user_id 为空时查全部（管理端）。keyword 匹配 order_no。"""
    stmt = select(Order).options(selectinload(Order.items))
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if keyword:
        stmt = stmt.where(Order.order_no.like(f"%{keyword}%"))
    if status:
        stmt = stmt.where(Order.status == status)
    from sqlalchemy import func as _f, select as _sel
    total = await db.scalar(_sel(_f.count()).select_from(stmt.subquery()))
    rows = await db.execute(
        stmt.order_by(desc(Order.created_at)).limit(limit).offset(offset)
    )
    return list(rows.scalars().all()), int(total or 0)


async def get_order(db: AsyncSession, order_id: int) -> Order | None:
    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


def _gen_order_no() -> str:
    return f"PN{datetime.now(timezone.utc).strftime('%Y%m%d')}{uuid.uuid4().hex[:8].upper()}"
