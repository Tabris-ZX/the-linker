from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "config.yaml"

DEFAULT_BACKEND_PORT = 5174
DEFAULT_LEVEL_SAVE_INTERVAL_SECONDS = 30
DEFAULT_MAX_REQUEST_BODY_BYTES = 128 * 1024
DEFAULT_DEVELOPER_AUTH_MAX_FAILED_ATTEMPTS = 3
DEFAULT_DEVELOPER_AUTH_LOCK_SECONDS = 2 * 60 * 60
DEFAULT_STORAGE_METHOD = "file"


@dataclass(frozen=True)
class AppSettings:
    """应用运行时所需的配置快照。"""
    backend_port: int
    developer_token: str
    max_request_body_bytes: int
    level_save_interval_seconds: int
    developer_auth_max_failed_attempts: int
    developer_auth_lock_seconds: int
    levels_dir: Path
    levels_hash_file: Path
    levels_index_file: Path
    answers_dir: Path
    storage_method: str
    sqlite_database_file: Path
    linker_sqlite_database_file: Path
    bridger_sqlite_database_file: Path


def get_settings() -> AppSettings:
    """读取项目配置文件并归一化为 `AppSettings`。"""
    config = read_app_config()
    server_config = config.get("server", {})
    path_config = config.get("path", {})
    storage_config = config.get("storage", {})
    linker_config = object_config(config.get("linker"))
    finder_config = object_config(config.get("finder"))
    bridger_config = object_config(config.get("bridger"))
    storage_method = normalize_storage_method(
        linker_config.get("storageMethod")
        or storage_config.get("method")
        or storage_config.get("type")
        or server_config.get("saveData")
    )
    linker_game_config = get_game_path_config(path_config, "linker")
    bridger_game_config = get_game_path_config(path_config, "bridger")
    linker_database_file = resolve_config_path(
        linker_config.get("database")
        or linker_config.get("sqlitePath")
        or linker_game_config.get("database")
        or storage_config.get("linkerSqlitePath")
        or storage_config.get("sqlitePath")
        or storage_config.get("database")
        or path_config.get("database")
        or "data/db/linker.db"
    )
    bridger_database_file = resolve_config_path(
        bridger_config.get("database")
        or bridger_config.get("sqlitePath")
        or bridger_game_config.get("database")
        or storage_config.get("bridgerSqlitePath")
        or "data/db/bridger.db"
    )
    linker_levels_dir = linker_config.get("levels") or path_config.get("levels") or "data/levels"
    linker_answers_dir = linker_config.get("answers") or path_config.get("answers") or "data/answers"
    linker_hash_file = linker_config.get("levelsHash") or path_config.get("levelsHash") or "data/levels-hash.json"
    linker_index_file = linker_config.get("levelsIndex") or path_config.get("levelsIndex") or "data/levels-index.json"
    # Finder currently uses the same map data model as Linker. Reading it here makes the
    # root config field explicit while keeping the runtime data source shared.
    _finder_database_file = finder_config.get("database") or finder_config.get("sqlitePath")
    return AppSettings(
        backend_port=clamp_integer(
            server_config.get("backendPort"),
            DEFAULT_BACKEND_PORT,
            1,
            65535,
        ),
        developer_token=str(server_config.get("su-token") or "").strip(),
        max_request_body_bytes=clamp_integer(
            server_config.get("maxRequestBodyBytes"),
            DEFAULT_MAX_REQUEST_BODY_BYTES,
            1,
            20 * 1024 * 1024,
        ),
        level_save_interval_seconds=clamp_integer(
            server_config.get("levelSaveIntervalSeconds"),
            DEFAULT_LEVEL_SAVE_INTERVAL_SECONDS,
            0,
            24 * 60 * 60,
        ),
        developer_auth_max_failed_attempts=clamp_integer(
            server_config.get("developerAuthMaxFailedAttempts"),
            DEFAULT_DEVELOPER_AUTH_MAX_FAILED_ATTEMPTS,
            1,
            100,
        ),
        developer_auth_lock_seconds=clamp_integer(
            server_config.get("developerAuthLockSeconds"),
            DEFAULT_DEVELOPER_AUTH_LOCK_SECONDS,
            0,
            30 * 24 * 60 * 60,
        ),
        levels_dir=resolve_config_path(linker_levels_dir),
        levels_hash_file=resolve_config_path(linker_hash_file),
        levels_index_file=resolve_config_path(linker_index_file),
        answers_dir=resolve_config_path(linker_answers_dir),
        storage_method=storage_method,
        sqlite_database_file=linker_database_file,
        linker_sqlite_database_file=linker_database_file,
        bridger_sqlite_database_file=bridger_database_file,
    )


def read_app_config() -> dict[str, Any]:
    """读取 `config/config.yaml`，不存在时返回空配置。"""
    if not CONFIG_PATH.is_file():
        return {}
    source = CONFIG_PATH.read_text(encoding="utf-8")
    loaded = yaml.safe_load(source) or {}
    return loaded if isinstance(loaded, dict) else {}


def resolve_config_path(value: Any) -> Path:
    """将配置中的相对路径解析为项目根目录下的绝对路径。"""
    path = Path(str(value)).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (PROJECT_ROOT / path).resolve()


def get_game_path_config(path_config: dict[str, Any], game_id: str) -> dict[str, Any]:
    """读取 path.games.<game_id> 配置；不存在时返回空映射。"""
    games_config = path_config.get("games")
    if not isinstance(games_config, dict):
        return {}
    game_config = games_config.get(game_id)
    return game_config if isinstance(game_config, dict) else {}


def object_config(value: Any) -> dict[str, Any]:
    """把配置块规范为字典。"""
    return value if isinstance(value, dict) else {}


def normalize_storage_method(value: Any) -> str:
    """将存储方式规范为 `file` 或 `sqlite`。"""
    method = str(value or DEFAULT_STORAGE_METHOD).strip().lower()
    if method == "database":
        return "sqlite"
    if method == "json":
        return "file"
    return method if method in {"file", "sqlite"} else DEFAULT_STORAGE_METHOD


def clamp_integer(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    """把任意值约束为指定整数区间，失败时回退到默认值。"""
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, number))
