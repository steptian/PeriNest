"""Agent 横切能力表：用量观测 + 问答会话持久化。

- pn_agent_usage：一次 agent 调用（crop_ask/ask/stream）的 token 与轮次账本，
  运营成本观测用；admin 见全局，普通用户仅本人（service 层过滤）
- pn_agent_message：问答会话消息（user/assistant 对），conversation 续聊用
"""
import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentUsage(Base):
    """一次 agent 调用的用量账本（INSERT-only，永不改写）。"""

    __tablename__ = "pn_agent_usage"
    __table_args__ = (Index("ix_pn_agent_usage_user_time", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)  # 发起者
    source: Mapped[str] = mapped_column(String(32))  # crop_ask / mcp_crop_ask / ...
    model: Mapped[str] = mapped_column(String(64), default="")
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    rounds: Mapped[int] = mapped_column(Integer, default=0)  # 工具循环轮次
    tool_calls: Mapped[int] = mapped_column(Integer, default=0)  # 工具调用次数
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )


class AgentMessage(Base):
    """问答会话消息（append-only，按 session_id 分组）。"""

    __tablename__ = "pn_agent_message"
    __table_args__ = (Index("ix_pn_agent_message_session", "session_id", "id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)  # 会话（前端生成 uuid）
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)  # 归属（越权过滤用）
    role: Mapped[str] = mapped_column(String(16))  # user / assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class AgentConversation(Base):
    """会话元数据（标题/通道/时间）——消息仍在 pn_agent_message，本表是会话壳。"""

    __tablename__ = "pn_agent_conversation"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    title: Mapped[str] = mapped_column(String(128), default="")  # 空=首问截断兜底
    channel: Mapped[str] = mapped_column(String(16), default="kb")  # kb / free
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
