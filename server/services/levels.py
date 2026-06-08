from __future__ import annotations

import json
import math
import re
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from server.config import get_settings
from server.paths import normalize_path, safe_child_path
from server.services.level_hash import (
    add_level_hash_to_index,
    create_empty_levels_hash_index,
    create_level_hash,
    remove_level_hash_from_index,
    write_levels_hash_index,
)
from server.utils.http import http_error

LEVEL_ID_RE = re.compile(r"^level-\d+$")
LEVEL_FILE_RE = re.compile(r"^level-(\d+)\.json$")
CATEGORY_ORDER = {"official": 0, "tests": 1, "deleted": 2}
LEVELS_CACHE_TTL_SECONDS = 30
LEVEL_INDEX_VERSION = 1

last_level_saved_at = 0.0
levels_cache_signature: tuple[tuple[str, int, int], ...] | None = None
levels_cache: list[dict[str, Any]] | None = None
levels_cache_checked_at = 0.0


def get_levels_dir() -> Path:
    return get_settings().levels_dir


def official_levels_dir() -> Path:
    return get_levels_dir() / "official"


def tests_levels_dir() -> Path:
    return get_levels_dir() / "tests"


def deleted_levels_dir() -> Path:
    return get_levels_dir() / "deleted"


def list_files(directory: Path) -> list[Path]:
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
    return file_path.suffix.lower() == ".json" and bool(LEVEL_FILE_RE.match(file_path.name))


def read_levels() -> list[dict[str, Any]]:
    levels_dir = get_levels_dir()
    levels_dir.mkdir(parents=True, exist_ok=True)
    return [dict(level) for level in get_cached_levels()]


def read_level_index() -> list[dict[str, Any]]:
    """读取关卡目录，只返回列表展示和筛选所需的轻量字段。"""
    return [dict(level) for level in read_level_index_cache()]


def read_level_by_id(level_id: str) -> dict[str, Any]:
    """按 id 读取完整关卡内容。"""
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(404, "Not Found", f"找不到关卡 {level_id}")
    file_path = find_level_file_path(level_id)
    if not file_path:
        raise http_error(404, "Not Found", f"找不到关卡 {level_id}")
    return read_level_file(file_path)


def read_level_by_source_path(source_path: str) -> dict[str, Any]:
    """按目录中的相对路径读取完整关卡内容。"""
    file_path = safe_child_path(get_levels_dir(), source_path)
    if not file_path.is_file() or not is_level_json_file(file_path):
        raise http_error(404, "Not Found", f"找不到关卡 {source_path}")
    return read_level_file(file_path)


def get_sorted_level_files() -> list[Path]:
    levels_dir = get_levels_dir()
    levels_dir.mkdir(parents=True, exist_ok=True)
    return sorted(
        [file_path for file_path in list_files(levels_dir) if is_level_json_file(file_path)],
        key=lambda file_path: (CATEGORY_ORDER.get(get_level_source_category(file_path), 9), file_path.name),
    )


def get_cached_levels() -> list[dict[str, Any]]:
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


def read_level_index_cache() -> list[dict[str, Any]]:
    files = get_sorted_level_files()
    signature = [list(item) for item in create_levels_signature(files)]
    index_file = get_settings().levels_index_file
    cached_index = read_levels_index_file(index_file)
    if is_valid_level_index_cache(cached_index, signature):
        return cached_index["levels"]

    levels = [create_level_index_item(read_level_file(file_path)) for file_path in files]
    write_level_index_file(index_file, levels, signature)
    return levels


def read_levels_index_file(index_file: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(index_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def is_valid_level_index_cache(payload: dict[str, Any] | None, signature: list[list[Any]]) -> bool:
    if payload is None:
        return False
    if payload.get("version") != LEVEL_INDEX_VERSION:
        return False
    if payload.get("signature") != signature:
        return False
    return isinstance(payload.get("levels"), list)


def write_level_index_file(index_file: Path, levels: list[dict[str, Any]], signature: list[list[Any]]) -> None:
    payload = {
        "version": LEVEL_INDEX_VERSION,
        "updatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "signature": signature,
        "levels": levels,
    }
    write_json_file(index_file, payload)


def refresh_level_index() -> list[dict[str, Any]]:
    files = get_sorted_level_files()
    signature = [list(item) for item in create_levels_signature(files)]
    levels = [create_level_index_item(read_level_file(file_path)) for file_path in files]
    write_level_index_file(get_settings().levels_index_file, levels, signature)
    return levels


def create_levels_signature(files: list[Path]) -> tuple[tuple[str, int, int], ...]:
    return tuple(create_level_file_signature(file_path) for file_path in files)


def invalidate_levels_cache() -> None:
    global levels_cache
    global levels_cache_checked_at
    global levels_cache_signature

    levels_cache = None
    levels_cache_checked_at = 0.0
    levels_cache_signature = None


def refresh_level_storage_indexes() -> None:
    invalidate_levels_cache()
    refresh_level_index()


def refresh_all_level_indexes() -> None:
    invalidate_levels_cache()
    refresh_levels_hash_index()
    refresh_level_index()


def create_level_file_signature(file_path: Path) -> tuple[str, int, int]:
    stat = file_path.stat()
    return (
        normalize_path(file_path.relative_to(get_levels_dir())),
        stat.st_mtime_ns,
        stat.st_size,
    )


def read_level_file(file_path: Path) -> dict[str, Any]:
    levels_dir = get_levels_dir()
    level = json.loads(file_path.read_text(encoding="utf-8"))
    level.update({
        "id": file_path.stem,
        "sourcePath": normalize_path(file_path.relative_to(levels_dir)),
        "sourceCategory": get_level_source_category(file_path),
    })
    return level


def create_level_index_item(level: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": level.get("id"),
        "name": level.get("name"),
        "difficulty": level.get("difficulty", 1),
        "gridType": level.get("gridType", "square"),
        "width": level.get("width"),
        "height": level.get("height"),
        "radius": level.get("radius"),
        "pairCount": len(level.get("pairs") or []),
        "sourcePath": level.get("sourcePath", ""),
        "sourceCategory": level.get("sourceCategory", "official"),
    }


def save_level(level: dict[str, Any]) -> dict[str, Any]:
    tests_levels_dir().mkdir(parents=True, exist_ok=True)
    if level.get("saveMode") == "update":
        return update_existing_level(level)

    level_id = get_next_level_id()
    level_hash = create_level_hash(level)
    hash_index = refresh_levels_hash_index()
    duplicate_level_ids = hash_index["hashes"].get(level_hash["hash"], [])
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    saved_level = dict(level)
    saved_level.pop("saveMode", None)
    saved_level.pop("sourcePath", None)
    saved_level.pop("sourceCategory", None)
    saved_level["id"] = level_id
    if not saved_level.get("name") or saved_level.get("name") == "Custom Level":
        saved_level["name"] = f"Level {level_id[6:]}"

    file_path = tests_levels_dir() / f"{level_id}.json"
    write_json_file(file_path, saved_level)
    write_levels_hash_index(add_level_hash_to_index(hash_index, saved_level["id"], level_hash))
    refresh_level_storage_indexes()
    return {
        **saved_level,
        "sourcePath": normalize_path(file_path.relative_to(get_levels_dir())),
        "sourceCategory": "tests",
    }


def update_existing_level(level: dict[str, Any]) -> dict[str, Any]:
    level_id = str(level.get("id") or "")
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(500, "Error", "只能修改已有的 level-xxx 关卡")

    file_path = find_level_file_path(level_id)
    if not file_path:
        raise http_error(500, "Error", f"找不到要修改的关卡 {level_id}")

    current_level = json.loads(file_path.read_text(encoding="utf-8"))
    saved_level = dict(level)
    saved_level.pop("saveMode", None)
    saved_level.pop("sourcePath", None)
    saved_level.pop("sourceCategory", None)
    saved_level["id"] = current_level.get("id", level_id)
    saved_level["name"] = current_level.get("name", f"Level {level_id[6:]}")

    level_hash = create_level_hash(saved_level)
    hash_index = refresh_levels_hash_index()
    duplicate_level_ids = [item for item in hash_index["hashes"].get(level_hash["hash"], []) if item != saved_level["id"]]
    if duplicate_level_ids:
        raise http_error(500, "Error", f"关卡重复：与 {', '.join(duplicate_level_ids)} 的地图结构和点对位置一致")

    write_json_file(file_path, saved_level)
    write_levels_hash_index(add_level_hash_to_index(remove_level_hash_from_index(hash_index, saved_level["id"]), saved_level["id"], level_hash))
    refresh_level_storage_indexes()
    return {
        **saved_level,
        "sourcePath": normalize_path(file_path.relative_to(get_levels_dir())),
        "sourceCategory": get_level_source_category(file_path),
    }


def review_test_level(review: dict[str, Any]) -> dict[str, Any]:
    level_id = str(review.get("levelId") or "")
    action = str(review.get("action") or "")
    if not LEVEL_ID_RE.match(level_id):
        raise http_error(500, "Error", "只能处理 level-xxx 测试关卡")
    if action not in {"include", "reject"}:
        raise http_error(500, "Error", "未知的测试关卡处理动作")

    official_levels_dir().mkdir(parents=True, exist_ok=True)
    tests_levels_dir().mkdir(parents=True, exist_ok=True)
    deleted_levels_dir().mkdir(parents=True, exist_ok=True)

    source_path = tests_levels_dir() / f"{level_id}.json"
    target_dir = official_levels_dir() if action == "include" else deleted_levels_dir()
    target_path = target_dir / f"{level_id}.json"
    if not source_path.is_file():
        raise http_error(500, "Error", f"找不到测试关卡 {level_id}")

    target_path.unlink(missing_ok=True)
    shutil.move(str(source_path), str(target_path))
    refresh_all_level_indexes()
    moved_level = json.loads(target_path.read_text(encoding="utf-8"))
    return {
        **moved_level,
        "id": level_id,
        "sourcePath": normalize_path(target_path.relative_to(get_levels_dir())),
        "sourceCategory": get_level_source_category(target_path),
    }


def write_json_file(file_path: Path, payload: dict[str, Any]) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def refresh_levels_hash_index() -> dict[str, Any]:
    index = create_empty_levels_hash_index()
    for level in read_levels():
        add_level_hash_to_index(index, level["id"], create_level_hash(level))
    write_levels_hash_index(index)
    return index


def get_next_level_id() -> str:
    max_number = 0
    for file_path in list_files(get_levels_dir()):
        matched = LEVEL_FILE_RE.match(file_path.name)
        if matched:
            max_number = max(max_number, int(matched.group(1)))
    return f"level-{max_number + 1:03d}"


def find_level_file_path(level_id: str) -> Path | None:
    for file_path in list_files(get_levels_dir()):
        if file_path.name == f"{level_id}.json":
            return file_path
    return None


def get_level_source_category(file_path: Path) -> str:
    relative_path = normalize_path(file_path.relative_to(get_levels_dir()))
    directory = relative_path.split("/", 1)[0]
    return directory if directory in CATEGORY_ORDER else "official"


def get_level_save_rate_limit() -> dict[str, Any]:
    elapsed = time.time() - last_level_saved_at
    level_save_interval = get_settings().level_save_interval_seconds
    if elapsed >= level_save_interval:
        return {"isLimited": False, "retryAfterSeconds": 0}
    return {"isLimited": True, "retryAfterSeconds": math.ceil(level_save_interval - elapsed)}


def mark_level_save_started() -> float:
    global last_level_saved_at
    save_started_at = time.time()
    last_level_saved_at = save_started_at
    return save_started_at


def reset_level_save_marker(save_started_at: float) -> None:
    global last_level_saved_at
    if last_level_saved_at == save_started_at:
        last_level_saved_at = 0
