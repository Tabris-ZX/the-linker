from __future__ import annotations

from server.games.bridger.models import BridgeLevel, BridgeLevelIndexItem
from server.games.bridger import repository
from server.utils.http import http_error

BRIDGE_LEVELS: list[BridgeLevel] = [
    {
        "id": "bridge-001",
        "name": "第一座桥",
        "difficulty": 1,
        "width": 7,
        "height": 5,
        "islands": [
            {"id": "a", "x": 1, "y": 1, "value": 2},
            {"id": "b", "x": 4, "y": 1, "value": 2},
            {"id": "c", "x": 1, "y": 3, "value": 2},
            {"id": "d", "x": 4, "y": 3, "value": 2},
        ],
    },
    {
        "id": "bridge-002",
        "name": "双线练习",
        "difficulty": 2,
        "width": 7,
        "height": 7,
        "islands": [
            {"id": "a", "x": 1, "y": 1, "value": 3},
            {"id": "b", "x": 5, "y": 1, "value": 3},
            {"id": "c", "x": 1, "y": 5, "value": 3},
            {"id": "d", "x": 5, "y": 5, "value": 3},
        ],
    },
    {
        "id": "bridge-003",
        "name": "中心交错",
        "difficulty": 3,
        "width": 9,
        "height": 7,
        "islands": [
            {"id": "a", "x": 1, "y": 1, "value": 2},
            {"id": "b", "x": 4, "y": 1, "value": 3},
            {"id": "c", "x": 7, "y": 1, "value": 2},
            {"id": "d", "x": 4, "y": 3, "value": 4},
            {"id": "e", "x": 1, "y": 5, "value": 2},
            {"id": "f", "x": 4, "y": 5, "value": 3},
            {"id": "g", "x": 7, "y": 5, "value": 2},
        ],
    },
]


def ensure_seed_levels() -> None:
    if repository.count_levels() > 0:
        return
    for level in BRIDGE_LEVELS:
        repository.write_level(level)


def read_bridge_level_index() -> list[BridgeLevelIndexItem]:
    ensure_seed_levels()
    return repository.read_level_index()


def read_bridge_level(level_id: str) -> BridgeLevel:
    ensure_seed_levels()
    level = repository.read_level(level_id)
    if level:
        return level
    raise http_error(404, "未找到", f"数桥关卡不存在：{level_id}")


def save_bridge_level(payload: dict) -> BridgeLevel:
    ensure_seed_levels()
    save_mode = str(payload.get("saveMode") or "create")
    level = dict(payload)
    level.pop("saveMode", None)
    if save_mode == "create" or not level.get("id"):
        level["id"] = repository.next_level_id(int(level.get("difficulty") or 1))
    elif not repository.read_level(str(level.get("id"))):
        raise http_error(404, "未找到", f"数桥关卡不存在：{level.get('id')}")
    return repository.write_level(level)
