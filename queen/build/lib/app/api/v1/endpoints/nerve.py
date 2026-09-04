"""Nerve (神经索) — AI 网关端点。

- POST /ai/chat        非流式，返回完整回复
- POST /ai/chat/stream SSE 流式（打字机效果）
"""
import json

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.services.ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    model: str | None = None  # 不传则用服务端默认


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(req: ChatRequest, user: CurrentUser) -> dict:
    text = await ai_service.chat([m.model_dump() for m in req.messages], req.model)
    return {"content": text, "model": req.model or "default"}


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, user: CurrentUser) -> StreamingResponse:
    async def gen():
        try:
            async for delta in ai_service.stream_chat(
                [m.model_dump() for m in req.messages], req.model
            ):
                yield _sse({"delta": delta})
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
