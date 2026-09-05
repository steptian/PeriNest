"""系统版本服务：解析仓库根 CHANGELOG.md 为结构化版本说明。

唯一源：CHANGELOG.md（Keep a Changelog 格式）。
四端版本说明（Wing/Leg/Antenna UI + API）统一消费本服务——
改版本记录只改 CHANGELOG.md 一处（发版三步流程已有）。
"""
from functools import lru_cache

from app.core.config import settings

from pathlib import Path

# 仓库根 = queen/app/services/system_service.py 上溯 3 级（同 config.py 算法）
_REPO_ROOT = Path(__file__).resolve().parents[3]


@lru_cache(maxsize=1)
def _parse_changelog_raw() -> tuple[list[dict], str]:
    """解析 CHANGELOG.md。

    返回 (版本列表, 源标识)。版本列表按文件顺序（新→旧）：
    [{"version": "0.9.1", "date": "2026-09-05",
      "sections": [{"title": "Improved", "items": ["...", "..."]}]}]

    读不到文件（打包部署无仓库根）返回空列表——版本号仍可用。
    """
    import re

    try:
        text = (_REPO_ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    except OSError:
        return [], "missing"

    versions: list[dict] = []
    current_version: dict | None = None
    current_section: dict | None = None
    current_item: list[str] | None = None

    def _flush_item() -> None:
        nonlocal current_item
        if current_item is not None and current_section is not None:
            current_section["items"].append("\n".join(current_item).strip())
        current_item = None

    for line in text.splitlines():
        m = re.match(r"^## \[(.+?)\](?: - (.+?))?\s*$", line)
        if m:
            _flush_item()
            current_version = {"version": m.group(1), "date": m.group(2) or "", "sections": []}
            versions.append(current_version)
            current_section = None
            continue
        m = re.match(r"^### (.+?)\s*$", line)
        if m and current_version is not None:
            _flush_item()
            current_section = {"title": m.group(1).strip(), "items": []}
            current_version["sections"].append(current_section)
            continue
        if line.startswith("- ") and current_section is not None:
            _flush_item()
            current_item = [line[2:]]
        elif line.startswith("  - ") and current_item is not None:
            current_item.append(line[4:])  # 缩进子项并入主条目
        elif not line.strip() and current_item is not None:
            _flush_item()
    _flush_item()
    return versions, "CHANGELOG.md"


def get_version_info() -> dict:
    """版本号 + 结构化更新记录（API 响应体）。"""
    changelog, source = _parse_changelog_raw()
    return {
        "version": settings.APP_VERSION,
        "source": source,
        "changelog": changelog,
    }
