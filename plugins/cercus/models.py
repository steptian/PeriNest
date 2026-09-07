"""Cercus 尾须 · 企微私域客户域（通用骨架，不绑业务）。

- pn_wecom_contact：外部联系人镜像（企微为权威源，本表为投影+运营扩展位）
- pn_wecom_followup：跟进记录时间线（append-only，运营自己的权威）
"""
import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Index, String, Text, func
from sqlalchemy import SmallInteger
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WecomContact(Base):
    """企微外部联系人镜像 + 运营扩展（tags/kv 为模板用户业务扩展位）。"""

    __tablename__ = "pn_wecom_contact"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_userid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    staff_userid: Mapped[str] = mapped_column(String(64), index=True)  # 所属员工（跟进人）
    name: Mapped[str] = mapped_column(String(128), default="")
    unionid: Mapped[str] = mapped_column(String(64), default="")
    avatar: Mapped[str] = mapped_column(String(512), default="")
    remark_mobile: Mapped[str] = mapped_column(String(32), default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)  # ["高意向", "已复购"]
    kv: Mapped[dict] = mapped_column(JSON, default=dict)  # 通用扩展位（业务字段放这里）
    synced_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())


class WecomFollowup(Base):
    """跟进记录（append-only 时间线，不改写历史）。"""

    __tablename__ = "pn_wecom_followup"
    __table_args__ = (Index("ix_pn_wecom_followup_contact", "contact_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    contact_id: Mapped[int] = mapped_column(BigInteger, index=True)
    staff_userid: Mapped[str] = mapped_column(String(64), default="")  # 记录人
    content: Mapped[str] = mapped_column(Text)
    next_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)  # 下次跟进
    done: Mapped[int] = mapped_column(SmallInteger, default=0)  # 0 待办 / 1 完成
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
