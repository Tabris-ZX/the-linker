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

STABLE_LEVEL_ID_RE = re.compile(r"^[1-5]\d{3}$")
TEMP_LEVEL_ID_RE = re.compile(r"^[1-5]\d{3}-tmp$")
LEVEL_ID_RE = re.compile(r"^(?:[1-5]\d{3}(?:-tmp)?|level-\d+)$")
LEVEL_FILE_RE = re.compile(r"^(?:[1-5]\d{3}(?:-tmp)?|level-\d+)\.json$")
CATEGORY_ORDER = {"stable": 0, "alpha": 1, "removed": 2}
LEVELS_CACHE_TTL_SECONDS = 30
LEVEL_INDEX_VERSION = 1

last_level_saved_at = 0.0
levels_cache_signature: tuple[tuple[str, int, int], ...] | None = None
levels_cache: list[dict[str, Any]] | None = None
levels_cache_checked_at = 0.0
level_index_cache: list[dict[str, Any]] | None = None


def get_levels_dir() -> Path:
    return get_settings().levels_dir


def stable_levels_dir() -> Path:
    return get_levels_dir() / "stable"


def alpha_levels_dir() -> Path:
    return get_levels_dir() / "alpha"


def removed_levels_dir() -> Path:
    return get_levels_dir() / "removed"


def get_answers_dir() -> Path:
    return get_settings().answers_dir


def normalize_level_category(category: Any) -> str:
    value = str(category or "stable")
    return value if value in CATEGORY_ORDER else "stable"


def normalize_level_difficulty(value: Any) -> int:
    try:
        difficulty = int(round(float(value)))
    except (TypeError, ValueError):
        return 1
    return min(5, max(1, difficulty))


def is_temporary_level_id(level_id: str) -> bool:
    return bool(TEMP_LEVEL_ID_RE.match(level_id))


def is_stable_level_id(level_id: str) -> bool:
    return bool(STABLE_LEVEL_ID_RE.match(level_id))


def get_default_level_name(level_id: str, category: str = "stable") -> str:
    prefix = "Lv" if normalize_level_category(category) == "stable" and is_stable_level_id(level_id) else "Imp"
    return f"{prefix} {level_id}"


def get_answer_file_path(level: dict[str, Any] | None = None, *, source_path: str = "", level_id: str = "", category: str = "") -> Path:
    if source_path:
        normalized_source_path = normalize_path(source_path)
        directory, _, file_name = normalized_source_path.partition("/")
        normalized_category = normalize_level_category(directory)
        answer_source_path = normalize_path(f"{normalized_category}/{file_name}") if file_name else normalized_category
        return safe_child_path(get_answers_dir(), answer_source_path)
    source_category = normalize_level_category(category or (level.get("sourceCategory") if level else "stable"))
    source_level_id = level_id or (str(level.get("id") or "") if level else "")
    return get_answers_dir() / source_category / f"{source_level_id}.json"


def split_level_answers(level: dict[str, Any]) -> tuple[dict[str, Any], list[Any]]:
    level_payload = dict(level)
    answers = level_payload.pop("answers", [])
    return level_payload, answers if isinstance(answers, list) else []


def read_level_answers(level: dict[str, Any]) -> list[Any]:
    answer_path = get_answer_file_path(level)
    try:
        payload = json.loads(answer_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(payload, dict) and isinstance(payload.get("answers"), list):
        return payload["answers"]
    return payload if isinstance(payload, list) else []


def read_level_with_answers(level: dict[str, Any]) -> dict[str, Any]:
    return {**level, "answers": read_level_answers(level)}


def write_answer_file(level: dict[str, Any], answers: list[Any]) -> None:
    answer_path = get_answer_file_path(level)
    write_json_file(answer_path, {"levelId": level.get("id"), "answers": answers})


def move_answer_file(source_level_id: str, source_category: str, target_level_id: str, target_category: str) -> None:
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


def strip_level_runtime_only_fields(level: dict[str, Any]) -> dict[str, Any]:
    payload = dict(level)
    payload.pop("sourcePath", None)
    payload.pop("sourceCategory", None)
    payload.pop("answers", None)
    return payload


def normalize_level_for_storage(level: dict[str, Any]) -> dict[str, Any]:
    payload = strip_level_runtime_only_fields(level)
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
    global level_index_cache

    if level_index_cache is not None:
        return level_index_cache

    cached_index = read_levels_index_file(get_settings().levels_index_file)
    if is_valid_level_index_cache(cached_index):
        level_index_cache = cached_index["levels"]
        return level_index_cache

    return refresh_level_index()


def read_levels_index_file(index_file: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(index_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def is_valid_level_index_cache(payload: dict[str, Any] | None) -> bool:
    if payload is None:
        return False
    if payload.get("version") != LEVEL_INDEX_VERSION:
        return False
    return isinstance(payload.get("levels"), list)


def write_level_index_file(index_file: Path, levels: list[dict[str, Any]]) -> None:
    payload = {
        "version": LEVEL_INDEX_VERSION,
        "updatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "levels": levels,
    }
    write_json_file(index_file, payload)


def refresh_level_index() -> list[dict[str, Any]]:
    global level_index_cache

    files = get_sorted_level_files()
    levels = [create_level_index_item(read_level_file(file_path)) for file_path in files]
    write_level_index_file(get_settings().levels_index_file, levels)
    level_index_cache = levels
    return levels


def invalidate_levels_cache() -> None:
    global levels_cache
    global levels_cache_checked_at
    global levels_cache_signature

    levels_cache = None
    levels_cache_checked_at = 0.0
    levels_cache_signature = None


def invalidate_level_index_cache() -> None:
    global level_index_cache

    level_index_cache = None


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
    level.pop("answers", None)
    level.update({
        "id": file_path.stem,
        "sourcePath": normalize_path(file_path.relative_to(levels_dir)),
        "sourceCategory": get_level_source_category(file_path),
    })
    return level


def create_level_index_item(level: dict[str, Any]) -> dict[str, Any]:
    item = {
        "id": level.get("id"),
        "name": level.get("name"),
        "difficulty": level.get("difficulty", 1),
        "sourcePath": level.get("sourcePath", ""),
        "sourceCategory": normalize_level_category(level.get("sourceCategory", "stable")),
    }
    return item


def save_level(level: dict[str, Any]) -> dict[str, Any]:
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


def update_existing_level(level: dict[str, Any]) -> dict[str, Any]:
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


def review_test_level(review: dict[str, Any]) -> dict[str, Any]:
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


def get_removed_level_id(source_level_id: str) -> str:
    target_level_id = source_level_id
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
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def refresh_levels_hash_index() -> dict[str, Any]:
    index = create_empty_levels_hash_index()
    for level in read_levels():
        add_level_hash_to_index(index, level["id"], create_level_hash(level))
    write_levels_hash_index(index)
    return index


def get_next_level_id(difficulty: Any, category: str) -> str:
    normalized_difficulty = normalize_level_difficulty(difficulty)
    normalized_category = normalize_level_category(category)
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
    for file_path in list_files(get_levels_dir()):
        if file_path.name == f"{level_id}.json":
            return file_path
    return None


def get_level_source_category(file_path: Path) -> str:
    relative_path = normalize_path(file_path.relative_to(get_levels_dir()))
    directory = relative_path.split("/", 1)[0]
    return normalize_level_category(directory)


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
