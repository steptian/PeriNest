"""Agent 横切服务：用量观测 + 会话持久化。

- record_usage：一次问答结束 fire-and-forget 落账（失败只记日志，不炸主链路）
- 会话：session_id 归属校验（本人/admin）+ 近 N 条 history 加载 + append 消息
"""
import structlog
from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.agent import AgentMessage, AgentUsage
from app.models.user import User

logger = structlog.get_logger(__name__)


async def record_usage(
    user_id: int,
    source: str,
    model: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    rounds: int = 0,
    tool_calls: int = 0,
) -> None:
    """落一条用量账。独立短连接——观测失败不影响问答事务。"""
    try:
        async with AsyncSessionLocal() as db:
            db.add(AgentUsage(
                user_id=user_id,
                source=source,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                rounds=rounds,
                tool_calls=tool_calls,
            ))
            await db.commit()
    except Exception as e:  # noqa: BLE001 — 观测链路失败静默（只记日志）
        logger.warning("agent_usage_record_failed", error=str(e)[:200])


async def usage_summary(user: User, days: int = 7) -> dict:
    """用量汇总：admin 见全局，普通用户仅本人（权限边界=用户边界）。"""
    import datetime as dt

    since = dt.datetime.now() - dt.timedelta(days=days)
    cond = AgentUsage.created_at >= since
    if user.role != "admin":
        cond = cond & (AgentUsage.user_id == user.id)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(
                func.count(AgentUsage.id),
                func.coalesce(func.sum(AgentUsage.prompt_tokens), 0),
                func.coalesce(func.sum(AgentUsage.completion_tokens), 0),
                func.coalesce(func.sum(AgentUsage.total_tokens), 0),
                func.coalesce(func.sum(AgentUsage.tool_calls), 0),
            ).where(cond)
        )).one()
    return {
        "scope": "all" if user.role == "admin" else f"user:{user.id}",
        "days": days,
        "calls": int(rows[0]),
        "prompt_tokens": int(rows[1]),
        "completion_tokens": int(rows[2]),
        "total_tokens": int(rows[3]),
        "tool_calls": int(rows[4]),
    }


# ---- 会话 ----

MAX_HISTORY = 20  # 续聊加载的最大历史条数（防 context 膨胀）


async def load_history(db, session_id: str, user: User) -> list[dict]:
    """加载会话近 N 条消息为对话历史。会话不存在/越权返回空（当新对话处理）。"""
    rows = (
        await db.execute(
            select(AgentMessage)
            .where(AgentMessage.session_id == session_id, AgentMessage.user_id == user.id)
            .order_by(AgentMessage.id.desc())
            .limit(MAX_HISTORY)
        )
    ).scalars().all()
    return [{"role": m.role, "content": m.content} for m in reversed(rows)]


async def append_messages(db, session_id: str, user: User, question: str, answer: str) -> None:
    """问答成功后追加 user+assistant 两条（随调用方事务提交）。"""
    db.add(AgentMessage(session_id=session_id, user_id=user.id, role="user", content=question))
    db.add(AgentMessage(session_id=session_id, user_id=user.id, role="assistant", content=answer))


async def list_conversations(db, user: User, limit: int = 30) -> list[dict]:
    """本人会话列表（按最近活动倒序）：session_id + 首问摘要 + 消息数 + 最近时间。"""
    rows = (
        await db.execute(
            select(
                AgentMessage.session_id,
                func.min(AgentMessage.id),
                func.count(AgentMessage.id),
                func.max(AgentMessage.created_at),
            )
            .where(AgentMessage.user_id == user.id)
            .group_by(AgentMessage.session_id)
            .order_by(func.max(AgentMessage.id).desc())
            .limit(limit)
        )
    ).all()
    conversations = []
    for session_id, first_id, count, last_time in rows:
        first = (
            await db.execute(
                select(AgentMessage.content).where(AgentMessage.id == first_id)
            )
        ).scalar_one_or_none()
        conversations.append({
            "session_id": session_id,
            "first_question": (first or "")[:60],
            "message_count": int(count),
            "last_time": last_time.isoformat() if last_time else "",
        })
    return conversations


async def get_conversation(db, session_id: str, user: User) -> list[dict] | None:
    """会话详情（本人会话；不存在或越权返回 None）。"""
    rows = (
        await db.execute(
            select(AgentMessage)
            .where(AgentMessage.session_id == session_id, AgentMessage.user_id == user.id)
            .order_by(AgentMessage.id)
        )
    ).scalars().all()
    if not rows:
        return None
    return [
        {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
        for m in rows
    ]
