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

    async def stream_chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        execute_tool,
        model: str | None = None,
        max_turns: int = 4,
    ) -> AsyncGenerator[dict, None]:
        """带工具循环的流式对话（agentic RAG 引擎，方案②）。

        OpenAI tool-calls 协议：LLM 自主决定调什么工具、检索几轮，直到能作答。
        轮次上限内最后一轮不再下发 tools，强制 LLM 用已有信息收尾（防无限循环）。
        工具结果截断入 context（≤4000 字符），防 token 爆炸。

        :param execute_tool: async (name: str, args: dict) -> dict，由编排层提供（含权限门）
        :yield: {"type": "tool_call", "name", "args"} | {"type": "tool_result", "name"}
                | {"type": "delta", "text"}
        """
        from app.services.runtime_config import AiRuntimeConfig

        cfg = await AiRuntimeConfig.ai()
        if settings.AI_MOCK or not cfg["key"]:
            raise AIServiceUnavailable(
                "AI 服务未配置：知识库问答需要真实 LLM（请配置 AI_API_KEY）"
            )

        convo = list(messages)
        headers = {"Authorization": f"Bearer {cfg['key']}"}
        base_url = f"{cfg['base']}/chat/completions"

        async with httpx.AsyncClient(timeout=cfg["timeout"]) as client:
            for turn in range(max_turns):
                payload: dict = {"model": model or cfg["model"], "messages": convo, "stream": True}
                if turn < max_turns - 1:  # 最后一轮不给工具，逼直答
                    payload["tools"] = tools
                tool_calls: dict[int, dict] = {}  # index -> {id, name, arguments}
                finish = ""
                async with client.stream(
                    "POST", base_url, json=payload, headers=headers
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line.removeprefix("data:").strip()
                        if data == "[DONE]":
                            break
                        try:
                            choice = json.loads(data)["choices"][0]
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                        delta = choice.get("delta") or {}
                        if delta.get("content"):
                            yield {"type": "delta", "text": delta["content"]}
                        for tc in delta.get("tool_calls") or []:
                            slot = tool_calls.setdefault(
                                tc.get("index", 0), {"id": "", "name": "", "arguments": ""}
                            )
                            if tc.get("id"):
                                slot["id"] = tc["id"]
                            fn = tc.get("function") or {}
                            if fn.get("name"):
                                slot["name"] = fn["name"]
                            if fn.get("arguments"):
                                slot["arguments"] += fn["arguments"]
                        if choice.get("finish_reason"):
                            finish = choice["finish_reason"]

                if finish != "tool_calls" or not tool_calls:
                    return  # 纯文本回答完成

                # 回填 assistant tool_calls 消息，逐个执行工具
                ordered = [slot for _, slot in sorted(tool_calls.items())]
                convo.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": s["id"] or f"call_{i}",
                            "type": "function",
                            "function": {"name": s["name"], "arguments": s["arguments"] or "{}"},
                        }
                        for i, s in enumerate(ordered)
                    ],
                })
                for i, slot in enumerate(ordered):
                    try:
                        args = json.loads(slot["arguments"] or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    yield {"type": "tool_call", "name": slot["name"], "args": args}
                    result = await execute_tool(slot["name"], args)
                    convo.append(
                        {
                            "role": "tool",
                            "tool_call_id": slot["id"] or f"call_{i}",
                            "content": json.dumps(result, ensure_ascii=False)[:4000],
                        }
                    )
                    yield {"type": "tool_result", "name": slot["name"]}

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


class AIServiceUnavailable(Exception):
    """未配置真实 LLM（AI_MOCK 或无 key）。需要真实模型的能力（如知识库问答）必须 fail-closed。"""


ai_service = AIService()
logger.info("nerve_init", mock=settings.ai_mock_enabled, base=settings.AI_API_BASE)
