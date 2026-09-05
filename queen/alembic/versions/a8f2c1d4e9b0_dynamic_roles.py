"""dynamic roles: pn_role/pn_role_perm + seed builtin roles

Revision ID: a8f2c1d4e9b0
Revises: 123355de3607
"""
from alembic import op
import sqlalchemy as sa

revision = "a8f2c1d4e9b0"
down_revision = "123355de3607"

SEEDS = [
    ("admin", "管理员", True,
     ["users", "orders", "feedback", "ai", "system"]),
    ("operator", "运营", False,
     ["users:read", "orders", "feedback", "ai"]),
    ("wing", "终端用户", False,
     ["orders", "feedback", "ai"]),
    ("antenna", "终端用户(微信)", False,
     ["orders", "feedback", "ai"]),
]


def upgrade() -> None:
    op.create_table(
        "pn_role",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("is_locked", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
    )
    op.create_table(
        "pn_role_perm",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("role_key", sa.String(32), sa.ForeignKey("pn_role.key"), nullable=False, index=True),
        sa.Column("perm", sa.String(50), nullable=False),
        sa.UniqueConstraint("role_key", "perm", name="uq_role_perm"),
    )
    # 种子内置角色
    roles = sa.table("pn_role",
        sa.column("key", sa.String), sa.column("name", sa.String),
        sa.column("is_locked", sa.Boolean))
    perms = sa.table("pn_role_perm",
        sa.column("role_key", sa.String), sa.column("perm", sa.String))
    for key, name, locked, plist in SEEDS:
        op.execute(roles.insert().values(key=key, name=name, is_locked=locked))
        for p in plist:
            op.execute(perms.insert().values(role_key=key, perm=p))


def downgrade() -> None:
    op.drop_table("pn_role_perm")
    op.drop_table("pn_role")
