"""出参序列化 Schema (Queen 神经递质 — response)。

时间字段统一 ISO 8601 格式输出（Pydantic V2 序列化 datetime 默认即为 ISO）。
"""
import datetime

from pydantic import BaseModel, ConfigDict


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None = None
    role: str
    is_active: bool
    created_at: datetime.datetime


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku_name: str
    quantity: int
    unit_price: float


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_no: str
    user_id: int
    status: str
    total_amount: float
    remark: str | None = None
    items: list[OrderItemResponse] = []
    created_at: datetime.datetime


class FeedbackResponse(BaseModel):
    id: int
    content: str
    created_at: datetime.datetime


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
