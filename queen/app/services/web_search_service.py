"""Web 搜索佐证（火山引擎联网搜索 API）。

agent 的 web_search 工具后端：实时信息（价格/新闻/最新动态）不在知识库，
联网佐证后作答。未配 key 或未启用时工具不下发（agent_tools 条件注册）。

API：https://www.volcengine.com/docs/85508/1650263（API Key 模式）
"""
import httpx
import structlog

logger = structlog.get_logger(__name__)

_API_URL = "https://open.feedcoopapi.com/search_api/web_search"


class WebSearchUnavailable(Exception):
    """未配置或调用失败——工具层降级为提示文本，不炸问答主链路。"""


async def _config() -> tuple[str, str]:
    from app.services.runtime_config import get_overrides

    ov = await get_overrides()
    key = ov.get("web_search.api_key") or ""
    enabled = (ov.get("web_search.enabled") or "").lower() in ("1", "true", "yes", "on")
    return key, "1" if enabled else ""


async def is_available() -> bool:
    key, enabled = await _config()
    return bool(key) and enabled


async def search(query: str, count: int = 5) -> list[dict]:
    """联网搜索，返回精简结果 [{title, url, summary}]。失败抛 WebSearchUnavailable。"""
    key, _enabled = await _config()
    if not key:
        raise WebSearchUnavailable("未配置 web_search.api_key")
    body = {
        "Query": query,
        "SearchType": "web",
        "Count": max(1, min(count, 10)),
        "NeedSummary": True,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _API_URL,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {key}",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        logger.warning("web_search_failed", error=str(e)[:200])
        raise WebSearchUnavailable(f"搜索上游异常: {e}") from e
    results = []
    for item in (data.get("Result") or {}).get("WebResults") or []:
        results.append({
            "title": item.get("Title", ""),
            "url": item.get("Url", ""),
            "summary": (item.get("Summary") or item.get("Snippet") or "")[:300],
        })
    return results
