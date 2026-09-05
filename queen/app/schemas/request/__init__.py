"""入参校验 Schema (Queen 神经递质 — request)。"""
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class StrictRequest(BaseModel):
    """REST 请求契约基类：未知字段一律 422（fail-closed）。

    借鉴 DeepSeek Harness wire 教训：被静默吞掉的未知字段教运维"开关没用"
    而非"名字写错"。字段拼错立即红，不进业务层。
    """

    model_config = ConfigDict(extra="forbid")


class RegisterRequest(StrictRequest):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None

    @model_validator(mode="after")
    def password_strength(self) -> "RegisterRequest":
        if self.password.isdigit():
            raise ValueError("密码不能为纯数字")
        return self


class LoginRequest(StrictRequest):
    username: str
    password: str


class WxLoginRequest(StrictRequest):
    """Antenna 端 wx.login 换取的 code。"""
    code: str


class CreateOrderRequest(StrictRequest):
    remark: str | None = None
    items: list["OrderItemRequest"] = Field(min_length=1)

    @model_validator(mode="after")
    def items_not_empty_amount(self) -> "CreateOrderRequest":
        if any(i.quantity <= 0 for i in self.items):
            raise ValueError("商品数量必须大于 0")
        return self


class OrderItemRequest(StrictRequest):
    sku_name: str = Field(min_length=1, max_length=255)
    quantity: int = Field(gt=0, le=9999)
    unit_price: float = Field(ge=0)


class FeedbackRequest(StrictRequest):
    content: str = Field(min_length=5, max_length=2000)
    contact: str | None = None


class CropDocumentCreate(StrictRequest):
    """吞入嗉囊：上传一份文本知识。"""

    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=10, max_length=200_000)
    source_type: str = Field(default="text", pattern="^(text|markdown)$")


class CropSearchRequest(StrictRequest):
    """嗉囊检索：语义查询 top-k chunk。"""

    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
