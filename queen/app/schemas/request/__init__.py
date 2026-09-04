"""入参校验 Schema (Queen 神经递质 — request)。"""
from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None

    @model_validator(mode="after")
    def password_strength(self) -> "RegisterRequest":
        if self.password.isdigit():
            raise ValueError("密码不能为纯数字")
        return self


class LoginRequest(BaseModel):
    username: str
    password: str


class WxLoginRequest(BaseModel):
    """Antenna 端 wx.login 换取的 code。"""
    code: str


class CreateOrderRequest(BaseModel):
    remark: str | None = None
    items: list["OrderItemRequest"] = Field(min_length=1)

    @model_validator(mode="after")
    def items_not_empty_amount(self) -> "CreateOrderRequest":
        if any(i.quantity <= 0 for i in self.items):
            raise ValueError("商品数量必须大于 0")
        return self


class OrderItemRequest(BaseModel):
    sku_name: str = Field(min_length=1, max_length=255)
    quantity: int = Field(gt=0, le=9999)
    unit_price: float = Field(ge=0)


class FeedbackRequest(BaseModel):
    content: str = Field(min_length=5, max_length=2000)
    contact: str | None = None
