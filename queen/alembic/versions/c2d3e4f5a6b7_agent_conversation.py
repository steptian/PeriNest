"""agent conversation metadata: pn_agent_conversation (title/channel)

Revision ID: c2d3e4f5a6b7
Revises: b3c4d5e6f7a8
"""
from alembic import op
import sqlalchemy as sa

revision = "c2d3e4f5a6b7"
down_revision = "a9b8c7d6e5f4"


def upgrade() -> None:
    op.create_table(
        "pn_agent_conversation",
        sa.Column("session_id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("title", sa.String(128), nullable=False, server_default=""),
        sa.Column("channel", sa.String(16), nullable=False, server_default="kb"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("pn_agent_conversation")
