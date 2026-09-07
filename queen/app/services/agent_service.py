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


async def audit_tool_call(
    user_id: int,
    tool: str,
    args: dict,
    ok: bool = True,
    denied: bool = False,
    preview: str = "",
) -> None:
    """agent 工具调用审计（pn_sys_log，source=agent-tool）。

    审计核心问题=「谁让 AI 干了什么」：每次工具调用留痕（含参数摘要与
    denied/unknown/error 结果）。独立连接 fire-and-forget，失败只记日志。
    """
    import json as _json

    level = "INFO" if ok and not denied else ("WARN" if denied else "ERROR")
    message = _json.dumps({
        "tool": tool,
        "args": {k: (v if len(str(v)) <= 120 else str(v)[:120] + "…") for k, v in (args or {}).items()},
        "ok": ok,
        "denied": denied,
        "preview": (preview or "")[:200],
    }, ensure_ascii=False)
    try:
        from app.models.sys_log import SysLog

        async with AsyncSessionLocal() as db:
            db.add(SysLog(user_id=user_id, level=level, source="agent-tool", message=message))
            await db.commit()
    except Exception as e:  # noqa: BLE001 — 审计失败不炸主链路
        logger.warning("agent_audit_failed", error=str(e)[:200])


async def audit_list(user_id: int | None = None, limit: int = 50, offset: int = 0) -> dict:
    """审计查询（admin 用）：最近 agent 工具调用留痕。"""
    from sqlalchemy import func as _f, select as _sel

    from app.models.sys_log import SysLog

    cond = SysLog.source == "agent-tool"
    if user_id:
        cond = cond & (SysLog.user_id == user_id)
    async with AsyncSessionLocal() as db:
        total = (await db.execute(_sel(_f.count()).select_from(SysLog).where(cond))).scalar_one()
        rows = (
            await db.execute(
                _sel(SysLog).where(cond).order_by(SysLog.id.desc()).limit(limit).offset(offset)
            )
        ).scalars().all()
    return {
        "total": int(total or 0),
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "level": r.level,
                "detail": r.message,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


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


async def ensure_conversation(
    db, session_id: str, user: User, channel: str = "kb", fallback_title: str = ""
) -> None:
    """建/触碰会话壳（随调用方事务）：首问截 16 字做默认标题（智能标题异步覆盖）。"""
    from app.models.agent import AgentConversation

    row = await db.get(AgentConversation, session_id)
    if row is None:
        db.add(AgentConversation(
            session_id=session_id, user_id=user.id, channel=channel,
            title=fallback_title.strip()[:16] or "新对话",
        ))
    # 已存在则不动（updated_at 由 onupdate 维护）


async def generate_title(session_id: str, user_id: int, question: str, answer: str) -> None:
    """智能标题：LLM ≤12 字（fire-and-forget；mock 环境静默跳过，保留截断标题）。"""
    try:
        from app.services.ai_service import AIServiceUnavailable, ai_service

        title = await ai_service.chat([
            {"role": "system", "content": "给下面的对话起一个不超过 12 个字的简短标题，直接输出标题本身，不要任何标点引号。"},
            {"role": "user", "content": f"问：{question[:200]}\n答：{answer[:200]}"},
        ])
        title = title.strip().strip('"'"'"'「」')[:12]
        if not title:
            return
        async with AsyncSessionLocal() as db:
            from app.models.agent import AgentConversation

            row = await db.get(AgentConversation, session_id)
            if row is not None and row.user_id == user_id:
                row.title = title
                await db.commit()
    except AIServiceUnavailable:
        pass  # mock 环境：保留默认截断标题
    except Exception as e:  # noqa: BLE001 — 标题失败无碍主链路
        logger.warning("agent_title_failed", error=str(e)[:200])


async def set_title(db, session_id: str, user: User, title: str) -> bool:
    """用户自定义标题（本人会话；空标题拒绝）。"""
    from app.models.agent import AgentConversation

    row = await db.get(AgentConversation, session_id)
    if row is None or row.user_id != user.id:
        return False
    row.title = title.strip()[:64] or row.title
    return True


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


async def append_messages(
    db, session_id: str, user: User, question: str, answer: str, channel: str = "kb"
) -> None:
    """问答成功后追加 user+assistant 两条（随调用方事务提交）。

    自动建会话壳（防消息孤岛）：无壳时以首问截断为默认标题。
    """
    db.add(AgentMessage(session_id=session_id, user_id=user.id, role="user", content=question))
    db.add(AgentMessage(session_id=session_id, user_id=user.id, role="assistant", content=answer))
    await ensure_conversation(db, session_id, user, channel, question)


async def list_conversations(db, user: User, limit: int = 30) -> list[dict]:
    """本人会话列表（按最近活动倒序）：会话壳元数据 + 消息数。"""
    from app.models.agent import AgentConversation

    convs = (
        await db.execute(
            select(AgentConversation)
            .where(AgentConversation.user_id == user.id)
            .order_by(AgentConversation.updated_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    out = []
    for c in convs:
        count = (
            await db.execute(
                select(func.count(AgentMessage.id)).where(
                    AgentMessage.session_id == c.session_id
                )
            )
        ).scalar_one()
        out.append({
            "session_id": c.session_id,
            "title": c.title or "新对话",
            "channel": c.channel,
            "message_count": int(count),
            "last_time": c.updated_at.isoformat() if c.updated_at else "",
        })
    return out


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
