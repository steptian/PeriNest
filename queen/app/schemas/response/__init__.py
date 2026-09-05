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


class CropDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_type: str
    size_bytes: int
    chunk_count: int
    status: str
    error: str | None = None
    created_by: int | None = None
    created_at: datetime.datetime


class CropChunkResponse(BaseModel):
    document_id: int
    seq: int
    content: str


class CropSearchHit(BaseModel):
    """一条检索命中：chunk + 来源文档 + 相似度。"""

    chunk_id: int
    document_id: int
    document_title: str
    seq: int
    content: str
    score: float  # cosine similarity，越大越近


class CropSearchResponse(BaseModel):
    query: str
    mock: bool  # 是否 mock embedding（提示 demo 环境）
    hits: list[CropSearchHit]
