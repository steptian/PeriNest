"""agent usage + session: pn_agent_usage / pn_agent_message

Revision ID: b3c4d5e6f7a8
Revises: e8f2b5d7c1a4
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "e8f2b5d7c1a4"


def upgrade() -> None:
    op.create_table(
        "pn_agent_usage",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("model", sa.String(64), nullable=False, server_default=""),
        sa.Column("prompt_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rounds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tool_calls", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pn_agent_usage_user_time", "pn_agent_usage", ["user_id", "created_at"])

    op.create_table(
        "pn_agent_message",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(64), nullable=False, index=True),
        sa.Column("user_id", sa.BigInteger, nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_pn_agent_message_session", "pn_agent_message", ["session_id", "id"])


def downgrade() -> None:
    op.drop_table("pn_agent_message")
    op.drop_index("ix_pn_agent_usage_user_time", table_name="pn_agent_usage")
    op.drop_table("pn_agent_usage")
