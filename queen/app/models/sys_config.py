"""运行时配置表（pn_sys_config）——管理端可改的 KV 存储。

优先级：DB > .env（DB 有值用 DB，回落环境变量）。
AI/embedding 的 key/model/base 抽象到这里，运营不碰服务器也能换模型。
"""
import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SysConfig(Base):
    __tablename__ = "pn_sys_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(2048), default="")
    updated_by: Mapped[str] = mapped_column(String(64), default="")
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
