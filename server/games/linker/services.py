from __future__ import annotations

import hashlib
import json
import random
import subprocess
import math
import re
import time
from datetime import UTC, datetime, timezone
from pathlib import Path
from typing import Any

from server.config import get_settings
from server.games.linker import repositories as level_db
from server.games.linker.models import LevelData, LevelIndexItem, ReviewData
from server.games.linker.level_hash import (
    add_level_hash_to_index,
    create_empty_levels_hash_index,
    create_level_hash,
    remove_level_hash_from_index,
    write_levels_hash_index,
)
from server.utils.paths import normalize_path, safe_child_path
from server.utils.http import http_error

STABLE_LEVEL_ID_RE = re.compile(r"^[1-5]\d{3}$")
TEMP_LEVEL_ID_RE = re.compile(r"^[1-5]\d{3}-tmp$")
LEVEL_ID_RE = re.compile(r"^(?:[1-5]\d{3}(?:-tmp)?|level-\d+)$")
LEVEL_FILE_RE = re.compile(r"^(?:[1-5]\d{3}(?:-tmp)?|level-\d+)\.json$")
CATEGORY_ORDER = {"stable": 0, "alpha": 1, "removed": 2}
LEVELS_CACHE_TTL_SECONDS = 30
LEVEL_INDEX_VERSION = 1
EQUILATERAL_MAX_WIDTH = 12
EQUILATERAL_MAX_HEIGHT = 8

last_level_saved_at = 0.0
levels_cache_signature: tuple[tuple[str, int, int], ...] | None = None
levels_cache: list[LevelData] | None = None
levels_cache_checked_at = 0.0
level_index_cache: list[LevelIndexItem] | None = None
level_index_cache_signature: tuple[int, int] | None = None


def get_levels_dir() -> Path:
    """返回关卡根目录。"""
    return get_settings().levels_dir


def stable_levels_dir() -> Path:
    """返回正式关卡目录。"""
    return get_levels_dir() / "stable"


def alpha_levels_dir() -> Path:
    """返回测试关卡目录。"""
    return get_levels_dir() / "alpha"


def removed_levels_dir() -> Path:
    """返回被拒绝关卡目录。"""
    return get_levels_dir() / "removed"


def get_answers_dir() -> Path:
    """返回答案文件根目录。"""
    return get_settings().answers_dir


def use_sqlite_storage() -> bool:
    """判断当前是否使用 SQLite 存储。"""
    return get_settings().storage_method == "sqlite"


def normalize_level_category(category: Any) -> str:
    """把关卡分类规范为 stable、alpha 或 removed。"""
    value = str(category or "stable")
    return value if value in CATEGORY_ORDER else "stable"


def normalize_level_difficulty(value: Any) -> int:
    """把难度规范为 1 到 5 的整数。"""
    try:
        difficulty = int(round(float(value)))
    except (TypeError, ValueError):
        return 1
    return min(5, max(1, difficulty))


def is_temporary_level_id(level_id: str) -> bool:
    """判断关卡 id 是否是测试关卡编号。"""
    return bool(TEMP_LEVEL_ID_RE.match(level_id))


def is_stable_level_id(level_id: str) -> bool:
    """判断关卡 id 是否是正式关卡编号。"""
    return bool(STABLE_LEVEL_ID_RE.match(level_id))


def get_default_level_name(level_id: str, category: str = "stable") -> str:
    """根据关卡 id 和分类生成默认展示名。"""
    prefix = "Lv" if normalize_level_category(category) == "stable" and is_stable_level_id(level_id) else "Imp"
    return f"{prefix} {level_id}"


def get_answer_file_path(level: LevelData | None = None, *, source_path: str = "", level_id: str = "", category: str = "") -> Path:
    """按关卡对象、sourcePath 或 id/category 计算答案文件路径。"""
    if source_path:
        normalized_source_path = normalize_path(source_path)
        directory, _, file_name = normalized_source_path.partition("/")
        normalized_category = normalize_level_category(directory)
        answer_source_path = normalize_path(f"{normalized_category}/{file_name}") if file_name else normalized_category
        return safe_child_path(get_answers_dir(), answer_source_path)
    source_category = normalize_level_category(category or (level.get("sourceCategory") if level else "stable"))
    source_level_id = level_id or (str(level.get("id") or "") if level else "")
    return get_answers_dir() / source_category / f"{source_level_id}.json"


def split_level_answers(level: LevelData) -> tuple[LevelData, list[Any]]:
    """从关卡载荷中拆出 answers 字段。"""
    level_payload = dict(level)
    answers = level_payload.pop("answers", [])
    return level_payload, answers if isinstance(answers, list) else []


def read_level_answers(level: LevelData) -> list[Any]:
    """读取关卡答案，兼容文件和 SQLite 存储。"""
    if use_sqlite_storage():
        return level_db.read_answers(
            normalize_level_category(level.get("sourceCategory", "stable")),
            str(level.get("id") or ""),
        )
    answer_path = get_answer_file_path(level)
    try:
        payload = json.loads(answer_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(payload, dict) and isinstance(payload.get("answers"), list):
        return payload["answers"]
    return payload if isinstance(payload, list) else []


def write_answer_file(level: LevelData, answers: list[Any]) -> None:
    """写入关卡答案。"""
    if use_sqlite_storage():
        level_db.write_answers(
            normalize_level_category(level.get("sourceCategory", "stable")),
            str(level.get("id") or ""),
            answers,
        )
        return
    answer_path = get_answer_file_path(level)
    write_json_file(answer_path, {"levelId": level.get("id"), "answers": answers})


def move_answer_file(source_level_id: str, source_category: str, target_level_id: str, target_category: str) -> None:
    """移动答案文件并同步其中记录的关卡 id。"""
    if use_sqlite_storage():
        answers = level_db.read_answers(normalize_level_category(source_category), source_level_id)
        level_db.write_answers(normalize_level_category(target_category), target_level_id, answers)
        return
    source_path = get_answers_dir() / normalize_level_category(source_category) / f"{source_level_id}.json"
    target_path = get_answers_dir() / normalize_level_category(target_category) / f"{target_level_id}.json"
    if not source_path.is_file():
        return
    try:
        payload = json.loads(source_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        payload = {"answers": []}
    if isinstance(payload, dict):
        payload["levelId"] = target_level_id
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.unlink(missing_ok=True)
    target_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    source_path.unlink(missing_ok=True)


def sync_answer_level_id(level_id: str, category: str) -> None:
    """修正答案文件中的 levelId。"""
    if use_sqlite_storage():
        return
    answer_path = get_answers_dir() / normalize_level_category(category) / f"{level_id}.json"
    if not answer_path.is_file():
        return
    try:
        payload = json.loads(answer_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(payload, dict):
        payload["levelId"] = level_id
        write_json_file(answer_path, payload)


def strip_level_runtime_only_fields(level: LevelData) -> LevelData:
    """移除只在运行时使用、不应保存的关卡字段。"""
    payload = dict(level)
    payload.pop("sourcePath", None)
    payload.pop("sourceCategory", None)
    payload.pop("answers", None)
    return payload


def normalize_level_for_storage(level: LevelData) -> LevelData:
    """把关卡对象规范为可持久化结构。"""
    payload = strip_level_runtime_only_fields(level)
    if str(payload.get("gridType") or "square") == "equilateral-triangle":
        payload["width"] = clamp_int(payload.get("width", 6), 2, EQUILATERAL_MAX_WIDTH)
        payload["height"] = clamp_int(payload.get("height", 3), 1, EQUILATERAL_MAX_HEIGHT)
        payload["width"] = min(EQUILATERAL_MAX_WIDTH, max(payload["width"], payload["height"] + 1))
    pairs = payload.get("pairs")
    if isinstance(pairs, list):
        payload["pairs"] = [
            {
                "id": str(pair.get("id") or index + 1),
                "points": pair.get("points") if isinstance(pair.get("points"), list) else [],
            }
            for index, pair in enumerate(pairs)
            if isinstance(pair, dict)
        ]
    return payload


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    """把数值约束在指定范围内。"""
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = minimum
    return min(maximum, max(minimum, number))


def list_files(directory: Path) -> list[Path]:
    """递归列出目录下的普通文件。"""
    if not directory.exists():
        return []
    files: list[Path] = []
    for entry in directory.iterdir():
        if entry.is_dir():
            files.extend(list_files(entry))
        elif entry.is_file() and entry.name != ".gitkeep":
            files.append(entry)
    return files


def is_level_json_file(file_path: Path) -> bool:
    """判断文件名是否符合关卡 JSON 命名规则。"""
    return file_path.suffix.lower() == ".json" and bool(LEVEL_FILE_RE.match(file_path.name))


def read_levels() -> list[LevelData]:
    """读取全部关卡完整内容。"""
    if use_sqlite_storage():
        return level_db.read_levels()
    levels_dir = get_levels_dir()
    levels_dir.mkdir(parents=True, exist_ok=True)
    return [dict(level) for level in get_cached_levels()]


def read_level_index() -> list[LevelIndexItem]:
    """读取关卡目录，只返回列表展示和筛选所需的轻量字段。"""
    if use_sqlite_storage():
        return level_db.read_level_index()
    return [dict(level) for level in read_level_index_cache()]


def read_level_by_id(level_id: str) -> LevelData:
    """按 id 读取完整关卡内容。"""
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(404, "Not Found", f"找不到关卡 {level_id}")
    if use_sqlite_storage():
        level = level_db.read_level_by_id(level_id)
        if not level:
            raise http_error(404, "Not Found", f"找不到关卡 {level_id}")
        return level
    file_path = find_level_file_path(level_id)
    if not file_path:
        raise http_error(404, "Not Found", f"找不到关卡 {level_id}")
    return read_level_file(file_path)


def read_level_by_source_path(source_path: str) -> LevelData:
    """按目录中的相对路径读取完整关卡内容。"""
    if use_sqlite_storage():
        level = level_db.read_level_by_source_path(source_path)
        if not level:
            raise http_error(404, "Not Found", f"找不到关卡 {source_path}")
        return level
    file_path = safe_child_path(get_levels_dir(), source_path)
    if not file_path.is_file() or not is_level_json_file(file_path):
        raise http_error(404, "Not Found", f"找不到关卡 {source_path}")
    return read_level_file(file_path)


def get_sorted_level_files() -> list[Path]:
    """按分类顺序和文件名列出关卡文件。"""
    levels_dir = get_levels_dir()
    levels_dir.mkdir(parents=True, exist_ok=True)
    return sorted(
        [file_path for file_path in list_files(levels_dir) if is_level_json_file(file_path)],
        key=lambda file_path: (CATEGORY_ORDER.get(get_level_source_category(file_path), 9), file_path.name),
    )


def get_cached_levels() -> list[LevelData]:
    """读取带短 TTL 和文件签名校验的关卡缓存。"""
    global levels_cache
    global levels_cache_checked_at
    global levels_cache_signature

    now = time.monotonic()
    if levels_cache is not None and now - levels_cache_checked_at < LEVELS_CACHE_TTL_SECONDS:
        return levels_cache

    files = get_sorted_level_files()
    signature = tuple(create_level_file_signature(file_path) for file_path in files)
    if levels_cache is None or levels_cache_signature != signature:
        levels_cache = [read_level_file(file_path) for file_path in files]
        levels_cache_signature = signature
    levels_cache_checked_at = now
    return levels_cache


def read_level_index_cache() -> list[LevelIndexItem]:
    """读取内存或磁盘中的关卡目录缓存。"""
    global level_index_cache
    global level_index_cache_signature

    index_file = get_settings().levels_index_file
    index_signature = create_file_signature(index_file)
    if level_index_cache is not None and level_index_cache_signature == index_signature:
        return level_index_cache

    cached_index = read_levels_index_file(index_file)
    if is_valid_level_index_cache(cached_index):
        level_index_cache = cached_index["levels"]
        level_index_cache_signature = index_signature
        return level_index_cache

    return refresh_level_index()


def read_levels_index_file(index_file: Path) -> dict[str, Any] | None:
    """读取关卡目录索引文件。"""
    try:
        payload = json.loads(index_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def is_valid_level_index_cache(payload: dict[str, Any] | None) -> bool:
    """校验关卡目录索引文件版本和结构。"""
    if payload is None:
        return False
    if payload.get("version") != LEVEL_INDEX_VERSION:
        return False
    return isinstance(payload.get("levels"), list)


def write_level_index_file(index_file: Path, levels: list[LevelIndexItem]) -> None:
    """把轻量关卡目录写入索引文件。"""
    payload = {
        "version": LEVEL_INDEX_VERSION,
        "updatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "levels": levels,
    }
    write_json_file(index_file, payload)


def refresh_level_index() -> list[LevelIndexItem]:
    """重新扫描关卡并刷新目录索引。"""
    global level_index_cache
    global level_index_cache_signature

    if use_sqlite_storage():
        level_index_cache = level_db.read_level_index()
        level_index_cache_signature = None
        return [dict(level) for level in level_index_cache]

    files = get_sorted_level_files()
    levels = [create_level_index_item(read_level_file(file_path)) for file_path in files]
    index_file = get_settings().levels_index_file
    write_level_index_file(index_file, levels)
    level_index_cache = levels
    level_index_cache_signature = create_file_signature(index_file)
    return levels


def invalidate_levels_cache() -> None:
    """清空完整关卡内存缓存。"""
    global levels_cache
    global levels_cache_checked_at
    global levels_cache_signature

    levels_cache = None
    levels_cache_checked_at = 0.0
    levels_cache_signature = None


def invalidate_level_index_cache() -> None:
    """清空关卡目录内存缓存。"""
    global level_index_cache
    global level_index_cache_signature

    level_index_cache = None
    level_index_cache_signature = None


def refresh_level_storage_indexes() -> None:
    """在关卡变更后刷新必要的存储索引。"""
    invalidate_levels_cache()
    if use_sqlite_storage():
        invalidate_level_index_cache()
        return
    refresh_level_index()


def refresh_all_level_indexes() -> None:
    """刷新关卡目录和哈希索引。"""
    invalidate_levels_cache()
    if use_sqlite_storage():
        level_db.sync_hashes(create_level_hash)
        invalidate_level_index_cache()
        return
    refresh_levels_hash_index()
    refresh_level_index()


def create_level_file_signature(file_path: Path) -> tuple[str, int, int]:
    """生成用于缓存失效判断的关卡文件签名。"""
    stat = file_path.stat()
    return (
        normalize_path(file_path.relative_to(get_levels_dir())),
        stat.st_mtime_ns,
        stat.st_size,
    )


def create_file_signature(file_path: Path) -> tuple[int, int] | None:
    """生成普通文件签名，文件不存在时返回 None。"""
    try:
        stat = file_path.stat()
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size)


def read_level_file(file_path: Path) -> LevelData:
    """读取单个关卡文件并补充来源字段。"""
    levels_dir = get_levels_dir()
    level = json.loads(file_path.read_text(encoding="utf-8"))
    level.pop("answers", None)
    level.update({
        "id": file_path.stem,
        "sourcePath": normalize_path(file_path.relative_to(levels_dir)),
        "sourceCategory": get_level_source_category(file_path),
    })
    return level


def create_level_index_item(level: LevelData) -> LevelIndexItem:
    """从完整关卡提取目录索引项。"""
    item = {
        "id": level.get("id"),
        "name": level.get("name"),
        "difficulty": level.get("difficulty", 1),
        "sourcePath": level.get("sourcePath", ""),
        "sourceCategory": normalize_level_category(level.get("sourceCategory", "stable")),
    }
    return item


def save_level(level: LevelData) -> LevelData:
    """保存新关卡或更新已有关卡。"""
    if use_sqlite_storage():
        return save_level_to_sqlite(level)

    alpha_levels_dir().mkdir(parents=True, exist_ok=True)
    if level.get("saveMode") == "update":
        return update_existing_level(level)

    saved_level, answers = split_level_answers(level)
    saved_level.pop("saveMode", None)
    saved_level = normalize_level_for_storage(saved_level)
    saved_level["difficulty"] = normalize_level_difficulty(saved_level.get("difficulty", 1))
    level_id = get_next_level_id(saved_level["difficulty"], "alpha")

    level_hash = create_level_hash(saved_level)
    hash_index = refresh_levels_hash_index()
    duplicate_level_ids = hash_index["hashes"].get(level_hash["hash"], [])
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    saved_level["id"] = level_id
    if not saved_level.get("name") or saved_level.get("name") == "Custom Level":
        saved_level["name"] = get_default_level_name(level_id, "alpha")

    file_path = alpha_levels_dir() / f"{level_id}.json"
    write_json_file(file_path, saved_level)
    write_answer_file({**saved_level, "sourceCategory": "alpha"}, answers)
    write_levels_hash_index(add_level_hash_to_index(hash_index, saved_level["id"], level_hash))
    refresh_level_storage_indexes()
    return {
        **saved_level,
        "sourcePath": normalize_path(file_path.relative_to(get_levels_dir())),
        "sourceCategory": "alpha",
    }


def update_existing_level(level: LevelData) -> LevelData:
    """更新文件存储中的已有关卡。"""
    if use_sqlite_storage():
        return update_existing_level_in_sqlite(level)

    level_id = str(level.get("id") or "")
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(500, "Error", "只能修改已有的关卡")

    file_path = find_level_file_path(level_id)
    if not file_path:
        raise http_error(500, "Error", f"找不到要修改的关卡 {level_id}")

    current_level = json.loads(file_path.read_text(encoding="utf-8"))
    source_category = get_level_source_category(file_path)
    saved_level, answers = split_level_answers(level)
    saved_level.pop("saveMode", None)
    saved_level = normalize_level_for_storage(saved_level)
    previous_difficulty = normalize_level_difficulty(current_level.get("difficulty", 1))
    next_difficulty = normalize_level_difficulty(saved_level.get("difficulty", previous_difficulty))
    target_level_id = level_id
    target_path = file_path
    should_rename_stable_level = source_category == "stable" and next_difficulty != previous_difficulty
    if should_rename_stable_level:
        target_level_id = get_next_level_id(next_difficulty, "stable")
        target_path = stable_levels_dir() / f"{target_level_id}.json"

    saved_level["id"] = target_level_id
    saved_level["difficulty"] = next_difficulty
    if should_rename_stable_level:
        saved_level["name"] = get_default_level_name(target_level_id, source_category)
    else:
        saved_level["name"] = current_level.get("name", get_default_level_name(target_level_id, source_category))

    level_hash = create_level_hash(saved_level)
    hash_index = refresh_levels_hash_index()
    duplicate_level_ids = [item for item in hash_index["hashes"].get(level_hash["hash"], []) if item not in {level_id, saved_level["id"]}]
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    if target_path != file_path:
        target_path.unlink(missing_ok=True)
        move_answer_file(level_id, source_category, target_level_id, source_category)
        file_path.unlink(missing_ok=True)

    write_json_file(target_path, saved_level)
    write_answer_file({**saved_level, "sourceCategory": source_category}, answers)
    sync_answer_level_id(target_level_id, source_category)
    hash_index = remove_level_hash_from_index(hash_index, level_id)
    hash_index = remove_level_hash_from_index(hash_index, saved_level["id"])
    write_levels_hash_index(add_level_hash_to_index(hash_index, saved_level["id"], level_hash))
    refresh_level_storage_indexes()
    return {
        **saved_level,
        "sourcePath": normalize_path(target_path.relative_to(get_levels_dir())),
        "sourceCategory": source_category,
    }


def review_test_level(review: ReviewData) -> LevelData:
    """审核文件存储中的测试关卡，收录或移入 removed。"""
    if use_sqlite_storage():
        return review_test_level_in_sqlite(review)

    level_id = str(review.get("levelId") or "")
    source_path_value = str(review.get("sourcePath") or "")
    action = str(review.get("action") or "")
    if action not in {"include", "reject"}:
        raise http_error(400, "Bad Request", "未知的测试关卡处理动作")

    stable_levels_dir().mkdir(parents=True, exist_ok=True)
    alpha_levels_dir().mkdir(parents=True, exist_ok=True)
    removed_levels_dir().mkdir(parents=True, exist_ok=True)

    if source_path_value:
        source_path = safe_child_path(get_levels_dir(), source_path_value)
    else:
        if not LEVEL_ID_RE.match(level_id):
            raise http_error(400, "Bad Request", "只能处理测试关卡")
        source_path = alpha_levels_dir() / f"{level_id}.json"

    if not source_path.is_file() or not is_level_json_file(source_path):
        raise http_error(404, "Not Found", f"找不到测试关卡 {source_path_value or level_id}")
    if get_level_source_category(source_path) != "alpha":
        raise http_error(400, "Bad Request", "只能处理测试版关卡")

    source_level_id = source_path.stem
    source_level = json.loads(source_path.read_text(encoding="utf-8"))
    difficulty = normalize_level_difficulty(source_level.get("difficulty", 1))
    target_category = "stable" if action == "include" else "removed"
    target_level_id = get_next_level_id(difficulty, "stable") if action == "include" else get_removed_level_id(source_level_id)
    target_dir = stable_levels_dir() if action == "include" else removed_levels_dir()
    target_path = target_dir / f"{target_level_id}.json"

    moved_level = normalize_level_for_storage(source_level)
    moved_level["id"] = target_level_id
    moved_level["difficulty"] = difficulty
    moved_level["name"] = get_default_level_name(target_level_id, target_category)

    target_path.unlink(missing_ok=True)
    write_json_file(target_path, moved_level)
    move_answer_file(source_level_id, "alpha", target_level_id, target_category)
    source_path.unlink(missing_ok=True)
    refresh_all_level_indexes()
    return {
        **moved_level,
        "sourcePath": normalize_path(target_path.relative_to(get_levels_dir())),
        "sourceCategory": target_category,
    }


def save_level_to_sqlite(level: LevelData) -> LevelData:
    """保存新关卡到 SQLite。"""
    if level.get("saveMode") == "update":
        return update_existing_level_in_sqlite(level)

    saved_level, answers = split_level_answers(level)
    saved_level.pop("saveMode", None)
    saved_level = normalize_level_for_storage(saved_level)
    saved_level["difficulty"] = normalize_level_difficulty(saved_level.get("difficulty", 1))
    level_id = get_next_level_id(saved_level["difficulty"], "alpha")

    level_hash = create_level_hash(saved_level)
    duplicate_level_ids = level_db.find_duplicate_level_ids(level_hash["hash"])
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    saved_level["id"] = level_id
    if not saved_level.get("name") or saved_level.get("name") == "Custom Level":
        saved_level["name"] = get_default_level_name(level_id, "alpha")
    saved_level["levelHash"] = level_hash["hash"]
    saved_level["levelCanonical"] = level_hash["canonical"]
    level_db.write_level(saved_level, "alpha", answers)
    refresh_level_storage_indexes()
    return {
        **strip_sqlite_private_fields(saved_level),
        "sourcePath": f"alpha/{level_id}.json",
        "sourceCategory": "alpha",
    }


def update_existing_level_in_sqlite(level: LevelData) -> LevelData:
    """更新 SQLite 中的已有关卡。"""
    level_id = str(level.get("id") or "")
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(500, "Error", "只能修改已有的关卡")

    current_level = level_db.read_level_by_id(level_id)
    if not current_level:
        raise http_error(500, "Error", f"找不到要修改的关卡 {level_id}")
    source_category = normalize_level_category(current_level.get("sourceCategory", "stable"))
    saved_level, answers = split_level_answers(level)
    saved_level.pop("saveMode", None)
    saved_level = normalize_level_for_storage(saved_level)
    previous_difficulty = normalize_level_difficulty(current_level.get("difficulty", 1))
    next_difficulty = normalize_level_difficulty(saved_level.get("difficulty", previous_difficulty))
    target_level_id = level_id
    should_rename_stable_level = source_category == "stable" and next_difficulty != previous_difficulty
    if should_rename_stable_level:
        target_level_id = get_next_level_id(next_difficulty, "stable")

    saved_level["id"] = target_level_id
    saved_level["difficulty"] = next_difficulty
    if should_rename_stable_level:
        saved_level["name"] = get_default_level_name(target_level_id, source_category)
    else:
        saved_level["name"] = current_level.get("name", get_default_level_name(target_level_id, source_category))

    level_hash = create_level_hash(saved_level)
    duplicate_level_ids = level_db.find_duplicate_level_ids(level_hash["hash"], {level_id, saved_level["id"]})
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    saved_level["levelHash"] = level_hash["hash"]
    saved_level["levelCanonical"] = level_hash["canonical"]
    if target_level_id != level_id:
        level_db.move_level(source_category, level_id, source_category, saved_level)
        level_db.write_answers(source_category, target_level_id, answers)
    else:
        level_db.write_level(saved_level, source_category, answers)
    refresh_level_storage_indexes()
    return {
        **strip_sqlite_private_fields(saved_level),
        "sourcePath": f"{source_category}/{target_level_id}.json",
        "sourceCategory": source_category,
    }


def review_test_level_in_sqlite(review: ReviewData) -> LevelData:
    """审核 SQLite 中的测试关卡。"""
    level_id = str(review.get("levelId") or "")
    source_path_value = str(review.get("sourcePath") or "")
    action = str(review.get("action") or "")
    if action not in {"include", "reject"}:
        raise http_error(400, "Bad Request", "未知的测试关卡处理动作")

    source_level = level_db.read_level_by_source_path(source_path_value) if source_path_value else level_db.read_level_by_id(level_id)
    if not source_level:
        raise http_error(404, "Not Found", f"找不到测试关卡 {source_path_value or level_id}")
    if normalize_level_category(source_level.get("sourceCategory")) != "alpha":
        raise http_error(400, "Bad Request", "只能处理测试版关卡")

    source_level_id = str(source_level.get("id") or level_id)
    difficulty = normalize_level_difficulty(source_level.get("difficulty", 1))
    target_category = "stable" if action == "include" else "removed"
    target_level_id = get_next_level_id(difficulty, "stable") if action == "include" else get_removed_level_id(source_level_id)

    moved_level = normalize_level_for_storage(source_level)
    moved_level["id"] = target_level_id
    moved_level["difficulty"] = difficulty
    moved_level["name"] = get_default_level_name(target_level_id, target_category)
    level_hash = create_level_hash(moved_level)
    moved_level["levelHash"] = level_hash["hash"]
    moved_level["levelCanonical"] = level_hash["canonical"]

    level_db.move_level("alpha", source_level_id, target_category, moved_level)
    refresh_all_level_indexes()
    return {
        **strip_sqlite_private_fields(moved_level),
        "sourcePath": f"{target_category}/{target_level_id}.json",
        "sourceCategory": target_category,
    }


def strip_sqlite_private_fields(level: LevelData) -> LevelData:
    """移除 SQLite 内部哈希字段后返回给 API。"""
    payload = dict(level)
    payload.pop("levelHash", None)
    payload.pop("levelCanonical", None)
    return payload


def get_removed_level_id(source_level_id: str) -> str:
    """为被拒绝关卡生成不冲突的 removed id。"""
    target_level_id = source_level_id
    if use_sqlite_storage():
        if not level_db.level_exists("removed", target_level_id):
            return target_level_id
        stem = source_level_id[:-4] if source_level_id.endswith("-tmp") else source_level_id
        for index in range(1, 1000):
            candidate = f"{stem}-removed-{index}"
            if not level_db.level_exists("removed", candidate):
                return candidate
        raise http_error(500, "Error", f"关卡 {source_level_id} 的待删编号已用尽")

    target_path = removed_levels_dir() / f"{target_level_id}.json"
    if not target_path.exists():
        return target_level_id
    stem = source_level_id[:-4] if source_level_id.endswith("-tmp") else source_level_id
    for index in range(1, 1000):
        candidate = f"{stem}-removed-{index}"
        if not (removed_levels_dir() / f"{candidate}.json").exists():
            return candidate
    raise http_error(500, "Error", f"关卡 {source_level_id} 的待删编号已用尽")


def write_json_file(file_path: Path, payload: dict[str, Any]) -> None:
    """以项目统一格式写入 JSON 文件。"""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def refresh_levels_hash_index() -> dict[str, Any]:
    """重建关卡哈希索引。"""
    if use_sqlite_storage():
        level_db.sync_hashes(create_level_hash)
        index = create_empty_levels_hash_index()
        for level in read_levels():
            add_level_hash_to_index(index, level["id"], create_level_hash(level))
        return index

    index = create_empty_levels_hash_index()
    for level in read_levels():
        add_level_hash_to_index(index, level["id"], create_level_hash(level))
    write_levels_hash_index(index)
    return index


def get_next_level_id(difficulty: Any, category: str) -> str:
    """按难度和分类分配下一个关卡编号。"""
    normalized_difficulty = normalize_level_difficulty(difficulty)
    normalized_category = normalize_level_category(category)
    if use_sqlite_storage():
        try:
            return level_db.get_next_level_id(normalized_difficulty, normalized_category)
        except RuntimeError as error:
            raise http_error(500, "Error", str(error)) from error

    is_temporary = normalized_category != "stable"
    directories = [stable_levels_dir()] if not is_temporary else [alpha_levels_dir(), removed_levels_dir()]
    used_numbers: set[int] = set()
    pattern = TEMP_LEVEL_ID_RE if is_temporary else STABLE_LEVEL_ID_RE

    for directory in directories:
        for file_path in list_files(directory):
            level_id = file_path.stem
            if not pattern.match(level_id):
                continue
            if int(level_id[0]) != normalized_difficulty:
                continue
            used_numbers.add(int(level_id[1:4]))

    for number in range(1, 1000):
        if number not in used_numbers:
            suffix = f"{number:03d}"
            return f"{normalized_difficulty}{suffix}{'-tmp' if is_temporary else ''}"

    raise http_error(500, "Error", f"难度 {normalized_difficulty} 的关卡编号已用尽")


def find_level_file_path(level_id: str) -> Path | None:
    """按 id 查找文件存储中的关卡路径。"""
    if use_sqlite_storage():
        level = level_db.read_level_by_id(level_id)
        if not level:
            return None
        return get_levels_dir() / normalize_path(level.get("sourcePath", ""))

    for file_path in list_files(get_levels_dir()):
        if file_path.name == f"{level_id}.json":
            return file_path
    return None


def get_level_source_category(file_path: Path) -> str:
    """从关卡文件路径推断来源分类。"""
    relative_path = normalize_path(file_path.relative_to(get_levels_dir()))
    directory = relative_path.split("/", 1)[0]
    return normalize_level_category(directory)


def get_level_save_rate_limit() -> dict[str, Any]:
    """读取当前保存关卡操作的限流状态。"""
    elapsed = time.time() - last_level_saved_at
    level_save_interval = get_settings().level_save_interval_seconds
    if elapsed >= level_save_interval:
        return {"isLimited": False, "retryAfterSeconds": 0}
    return {"isLimited": True, "retryAfterSeconds": math.ceil(level_save_interval - elapsed)}


def mark_level_save_started() -> float:
    """记录一次保存开始时间并返回该时间戳。"""
    global last_level_saved_at
    save_started_at = time.time()
    last_level_saved_at = save_started_at
    return save_started_at


def reset_level_save_marker(save_started_at: float) -> None:
    """保存失败时回滚对应的保存时间标记。"""
    global last_level_saved_at
    if last_level_saved_at == save_started_at:
        last_level_saved_at = 0
