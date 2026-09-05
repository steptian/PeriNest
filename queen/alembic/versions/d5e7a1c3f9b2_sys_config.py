"""sys config: pn_sys_config KV (runtime ai/embedding config)

Revision ID: d5e7a1c3f9b2
Revises: c9d4f2a6b8e1
"""
from alembic import op
import sqlalchemy as sa

revision = "d5e7a1c3f9b2"
down_revision = "c9d4f2a6b8e1"


def upgrade() -> None:
    op.create_table(
        "pn_sys_config",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.String(2048), nullable=False, server_default=""),
        sa.Column("updated_by", sa.String(64), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        mysql_charset="utf8mb4",
    )


def downgrade() -> None:
    op.drop_table("pn_sys_config")
