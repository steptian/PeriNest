"""Nerve (神经索) — AI 网关业务逻辑。

OpenAI 兼容格式统一适配：DeepSeek / Kimi / Qwen / Ollama / vLLM 等一套通吃。
未配置 AI_API_KEY 时自动进入 mock 模式（模拟流式输出），保证 demo 与 CI 零成本可跑。
"""
import asyncio
import json
from collections.abc import AsyncGenerator

import httpx

from app.core.config import settings
from app.utils.logger import logger


class AIService:
    """薄封装：chat completions 流式/非流式。"""

    async def stream_chat(
        self, messages: list[dict], model: str | None = None
    ) -> AsyncGenerator[str, None]:
        """流式对话，逐段 yield 文本增量。

        :param messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
        """
        # 运行时配置（DB > .env）：管理端改 key/model 即时生效
        from app.services.runtime_config import AiRuntimeConfig

        cfg = await AiRuntimeConfig.ai()
        if settings.AI_MOCK or not cfg["key"]:
            async for chunk in self._mock_stream(messages):
                yield chunk
            return

        payload = {
            "model": model or cfg["model"],
            "messages": messages,
            "stream": True,
        }
        headers = {"Authorization": f"Bearer {cfg['key']}"}
        async with httpx.AsyncClient(timeout=cfg["timeout"]) as client:
            async with client.stream(
                "POST",
                f"{cfg['base']}/chat/completions",
                json=payload,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == "[DONE]":
                        break
                    try:
                        delta = json.loads(data)["choices"][0]["delta"].get("content", "")
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
                    if delta:
                        yield delta

    async def chat(self, messages: list[dict], model: str | None = None) -> str:
        """非流式对话，返回完整文本。"""
        chunks: list[str] = []
        async for chunk in self.stream_chat(messages, model):
            chunks.append(chunk)
        return "".join(chunks)

    @staticmethod
    async def _mock_stream(messages: list[dict]) -> AsyncGenerator[str, None]:
        """Mock 模式：模拟打字机流，让 demo/CI 在零 key 零成本下验证全链路。"""
        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        reply = (
            f"[PeriNest Nerve · mock 模式] 已收到你的消息「{last_user[:20]}」。\n\n"
            "当前未配置 AI_API_KEY，这是模拟流式回复。\n"
            "在 .env 中配置任意 OpenAI 兼容服务（DeepSeek/Kimi/Qwen/Ollama）即可接入真实模型。"
        )
        for i in range(0, len(reply), 3):
            yield reply[i : i + 3]
            await asyncio.sleep(0.05)  # 模拟网络延迟，前端可见打字机效果


ai_service = AIService()
logger.info("nerve_init", mock=settings.ai_mock_enabled, base=settings.AI_API_BASE)
