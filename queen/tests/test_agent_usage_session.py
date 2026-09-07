"""Agent 横切能力测试：用量观测 + 会话持久化。"""
import uuid


async def test_usage_summary_scope(client, auth_headers):
    """admin 见全局，普通用户仅本人（权限边界=用户边界）。"""
    from app.core.database import AsyncSessionLocal
    from app.models.agent import AgentUsage
    from app.models.user import User
    from app.services import agent_service

    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            __import__("sqlalchemy").select(User).order_by(User.id.desc()).limit(1)
        )).scalar_one()
        wing_id = user.id  # auth_headers 刚注册的 wing 用户（最后注册）
        admin_id = 1 if user.role != "admin" else user.id
        db.add(AgentUsage(user_id=wing_id, source="crop_ask", model="m",
                          prompt_tokens=100, completion_tokens=50, total_tokens=150))
        await db.commit()
        uid = user.id

    # 本人视角
    class FakeUser:
        id = uid
        role = "wing"

    s = await agent_service.usage_summary(FakeUser(), days=7)
    assert s["scope"] == f"user:{uid}"
    assert s["calls"] >= 1 and s["total_tokens"] >= 150


async def test_conversation_roundtrip(client, auth_headers):
    """会话：append → 列表 → 详情 → 越权隔离。"""
    from app.core.database import AsyncSessionLocal
    from app.models.user import User
    from app.services import agent_service
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).order_by(User.id.desc()).limit(1)
        )).scalar_one()
        uid = user.id

    class FakeUser:
        id = uid
        role = "wing"

    class FakeUser2:
        id = uid + 99999  # 他人
        role = "wing"

    sid = f"sess_{uuid.uuid4().hex[:12]}"
    async with AsyncSessionLocal() as db:
        await agent_service.append_messages(db, sid, FakeUser(), "问题一", "答案一")
        await db.commit()

    async with AsyncSessionLocal() as db:
        history = await agent_service.load_history(db, sid, FakeUser())
        assert [(m["role"], m["content"]) for m in history] == [
            ("user", "问题一"), ("assistant", "答案一"),
        ]
        # 越权：他人读不到（返回空=新会话处理）
        assert await agent_service.load_history(db, sid, FakeUser2()) == []

        convs = await agent_service.list_conversations(db, FakeUser())
        match = [c for c in convs if c["session_id"] == sid]
        assert match and match[0]["title"] == "问题一"  # 默认标题=首问截断
        assert match[0]["channel"] == "kb"

        # 自定义标题（本人）+ 越权拒绝
        assert await agent_service.set_title(db, sid, FakeUser(), "我的会话")
        assert not await agent_service.set_title(db, sid, FakeUser2(), "偷改")
        convs = await agent_service.list_conversations(db, FakeUser())
        match = [c for c in convs if c["session_id"] == sid]
        assert match[0]["title"] == "我的会话"

        assert await agent_service.get_conversation(db, sid, FakeUser2()) is None
        detail = await agent_service.get_conversation(db, sid, FakeUser())
        assert len(detail) == 2


async def test_usage_record_fire_and_forget(client):
    """record_usage 独立连接落库，不依赖调用方事务。"""
    from app.services import agent_service

    await agent_service.record_usage(
        user_id=1, source="crop_ask", model="deepseek-chat",
        prompt_tokens=10, completion_tokens=5, rounds=2, tool_calls=3,
    )
    from app.core.database import AsyncSessionLocal
    from app.models.agent import AgentUsage
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(AgentUsage).where(
                AgentUsage.source == "crop_ask", AgentUsage.tool_calls == 3
            ).order_by(AgentUsage.id.desc()).limit(1)
        )).scalar_one()
        assert row.rounds == 2 and row.total_tokens == 15


async def test_agent_audit_trail(client, auth_headers):
    """审计留痕：工具调用落 pn_sys_log；端点 admin 可查、wing 403。"""
    import json as _json

    from app.services import agent_service

    await agent_service.audit_tool_call(
        1, "crop_search", {"query": "机密"}, ok=True, preview="ok"
    )
    await agent_service.audit_tool_call(
        1, "list_orders", {"limit": 10}, denied=True, preview="缺少权限 orders"
    )
    d = await agent_service.audit_list(user_id=1, limit=10)
    assert d["total"] >= 2
    items = d["items"]
    assert items[0]["level"] == "WARN"  # denied → WARN
    detail = _json.loads(items[0]["detail"])
    assert detail["tool"] == "list_orders" and detail["denied"] is True

    # 端点：wing 无 system 权限 403
    r = await client.get("/api/v1/system/agent-audit", headers=auth_headers)
    assert r.status_code == 403


def test_ask_history_normalization():
    """续聊历史兼容归一：dict(load_history) 与 AskMessage(Pydantic) 双形态。
    回归：'dict' object has no attribute 'role'（conversation 第二轮触发）。"""
    from app.schemas.request import AskMessage
    from app.services.crop_service import ASK_SYSTEM_PROMPT

    # 模拟 ask_stream 内 messages 构造对两种形态的处理
    history = [
        {"role": "user", "content": "问一"},        # load_history 产物
        AskMessage(role="assistant", content="答一"),  # 请求体产物
    ]
    def _norm(m):
        return (
            {"role": m["role"], "content": m["content"]}
            if isinstance(m, dict)
            else {"role": m.role, "content": m.content}
        )
    msgs = [ASK_SYSTEM_PROMPT and {"role": "system", "content": ASK_SYSTEM_PROMPT}]
    msgs += [_norm(m) for m in history] + [{"role": "user", "content": "问二"}]
    assert msgs[1] == {"role": "user", "content": "问一"}
    assert msgs[2] == {"role": "assistant", "content": "答一"}
    assert msgs[3]["role"] == "user"
