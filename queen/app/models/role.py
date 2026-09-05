"""动态角色表 (pn_role / pn_role_perm)。

角色定义运行时可配置（管理端矩阵页编辑），admin 角色锁定不可删改（防自锁）。
权限判定链：用户.role(key) → pn_role_perm → 角色权限 ⊕ pn_perm_override = 最终权限。
内置角色种子见 core/permissions.py 的 DEFAULT_ROLE_SEEDS（alembic 迁移时写入）。
"""
import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Role(Base):
    __tablename__ = "pn_role"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), comment="显示名")
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_locked: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", comment="admin 角色锁定不可删改"
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )

    perms: Mapped[list["RolePerm"]] = relationship(
        back_populates="role", cascade="all, delete-orphan", lazy="selectin"
    )


class RolePerm(Base):
    __tablename__ = "pn_role_perm"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role_key: Mapped[str] = mapped_column(String(32), ForeignKey("pn_role.key"), index=True)
    perm: Mapped[str] = mapped_column(String(50), comment="权限点：域 / 域:read / 域:write")

    role: Mapped[Role] = relationship(back_populates="perms")

    __table_args__ = (UniqueConstraint("role_key", "perm", name="uq_role_perm"),)
