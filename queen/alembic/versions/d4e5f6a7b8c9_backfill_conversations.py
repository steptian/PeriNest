"""backfill: 存量消息会话回填 pn_agent_conversation 壳（首问=默认标题）

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
"""
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c2d3e4f5a6b7"


def upgrade() -> None:
    # 每会话取首条 user 消息作标题兜底；channel 默认 kb（存量基本是知识库问答）
    op.execute(
        """
        INSERT INTO pn_agent_conversation (session_id, user_id, title, channel)
        SELECT m.session_id, m.user_id,
               COALESCE(SUBSTRING(MIN(CASE WHEN m.role='user' THEN m.content END), 1, 16), '新对话'),
               'kb'
        FROM pn_agent_message m
        WHERE NOT EXISTS (SELECT 1 FROM pn_agent_conversation c WHERE c.session_id = m.session_id)
        GROUP BY m.session_id, m.user_id
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM pn_agent_conversation WHERE session_id LIKE 'conv_%'")
