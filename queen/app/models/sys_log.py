"""系统日志表 (pn_sys_log) — 腹部：日志、反馈、附件。"""
import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SysLog(Base):
    __tablename__ = "pn_sys_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    level: Mapped[str] = mapped_column(String(16), default="INFO", server_default="INFO")
    # request / feedback / system ...
    source: Mapped[str] = mapped_column(String(64), default="system", server_default="system")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
