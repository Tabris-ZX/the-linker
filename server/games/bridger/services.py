from __future__ import annotations

from server.games.bridger import repositories as repository
from server.games.bridger.models import LevelData, LevelIndexItem
from server.utils.http import http_error


def read_level_index() -> list[LevelIndexItem]:
    return repository.read_level_index()


def read_level(level_id: str) -> LevelData:
    level = repository.read_level(level_id)
    if level:
        return level
    raise http_error(404, "未找到", f"数桥关卡不存在：{level_id}")


def read_level_by_source_path(source_path: str) -> LevelData:
    level = repository.read_level_by_source_path(source_path)
    if level:
        return level
    raise http_error(404, "未找到", f"数桥关卡不存在：{source_path}")


def refresh_level_index() -> list[LevelIndexItem]:
    return repository.read_level_index()


def save_level(payload: dict) -> LevelData:
    save_mode = str(payload.get("saveMode") or "create")
    source_category = str(payload.get("sourceCategory") or "stable")
    level = dict(payload)
    level.pop("saveMode", None)
    if save_mode == "create" or not level.get("id"):
        level["id"] = repository.next_level_id(int(level.get("difficulty") or 1), source_category)
    elif not repository.read_level(str(level.get("id"))):
        raise http_error(404, "未找到", f"数桥关卡不存在：{level.get('id')}")
    return repository.write_level(level, source_category)
