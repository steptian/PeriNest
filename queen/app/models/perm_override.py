"""账号级权限覆盖表 (pn_perm_override)。

最终权限 = 角色模板 ⊕ 账号覆盖（grant 追加 / deny 撤销，deny 绝对优先）。
仅非 admin 角色可覆盖；admin 锁死全域（防自锁）。
权限变更是高危动作，全部经 MCP/REST 的写操作已有操作留痕（pn_sys_log）。
"""
import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PermOverride(Base):
    __tablename__ = "pn_perm_override"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pn_user.id"), index=True
    )
    perm: Mapped[str] = mapped_column(String(50), comment="权限点，如 users / orders:read")
    effect: Mapped[str] = mapped_column(String(8), comment="grant 授予 / deny 撤销")
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )

    __table_args__ = (UniqueConstraint("user_id", "perm", name="uq_user_perm_override"),)
