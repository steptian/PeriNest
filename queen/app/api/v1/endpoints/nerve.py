"""Nerve (神经索) — AI 网关端点。

- POST /ai/chat        非流式，返回完整回复
- POST /ai/chat/stream SSE 流式（打字机效果）
"""
import json

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import Field

from app.api.deps import CurrentUser, DBSession
from app.core.permissions import AI, require_permission
from app.schemas.request import ChatMessage, StrictRequest
from app.services.ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(StrictRequest):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    model: str | None = None  # 不传则用服务端默认
    conversation_id: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9_-]{1,64}$")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(require_permission(AI))) -> dict:
    text = await ai_service.chat([m.model_dump() for m in req.messages], req.model)
    return {"content": text, "model": req.model or "default"}


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    db: DBSession,
    user=Depends(require_permission(AI)),
) -> StreamingResponse:
    async def gen():
        answer_parts: list[str] = []
        try:
            async for delta in ai_service.stream_chat(
                [m.model_dump() for m in req.messages], req.model
            ):
                answer_parts.append(delta)
                yield _sse({"delta": delta})
            # B：自由对话持久化——流成功后存档（会话壳 + user/assistant 两条 + 智能标题）
            if req.conversation_id:
                last_user = next(
                    (m.content for m in reversed(req.messages) if m.role == "user"), ""
                )
                answer = "".join(answer_parts)
                from app.services import agent_service

                await agent_service.append_messages(
                    db, req.conversation_id, user, last_user, answer, channel="free"
                )
                await db.commit()
                import asyncio

                asyncio.create_task(agent_service.generate_title(
                    req.conversation_id, user.id, last_user, answer
                ))
            yield _sse({"done": True})
        except httpx.HTTPError as e:
            yield _sse({"error": f"上游 AI 服务异常: {e}"})
        except Exception as e:  # noqa: BLE001 — SSE 通道内异常必须转文本下发，不能断流
            yield _sse({"error": f"AI 服务异常: {e}"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
