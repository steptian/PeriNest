"""版本说明 API：CHANGELOG 解析 + 行内 md runs 渲染契约。"""


async def test_changelog_inline_runs(client):
    """item = runs 列表：**bold** 与 `code` 被解析为语义 run，其余为 text。"""
    from app.services.system_service import _inline_runs, get_version_info

    runs = _inline_runs("**Crop 嗦囊 agentic 问答（方案②）**：`POST /crop/ask` 上线")
    assert runs[0] == {"t": "bold", "s": "Crop 嗦囊 agentic 问答（方案②）"}
    assert runs[1] == {"t": "text", "s": "："}
    assert runs[2] == {"t": "code", "s": "POST /crop/ask"}

    info = get_version_info()
    assert info["version"]
    assert isinstance(info["changelog"], list)
    # 真实 CHANGELOG 首个条目应有 runs 结构（含 bold/code/text 三种之一以上）
    first = info["changelog"][0]
    assert first["sections"], "CHANGELOG 首版本应有 sections"
    some_runs = first["sections"][0]["items"][0]
    assert isinstance(some_runs, list) and {"t", "s"} <= set(some_runs[0])
