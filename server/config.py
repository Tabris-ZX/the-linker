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


@dataclass(frozen=True)
class AppSettings:
    backend_port: int
    developer_token: str
    max_request_body_bytes: int
    level_save_interval_seconds: int
    developer_auth_max_failed_attempts: int
    developer_auth_lock_seconds: int
    levels_dir: Path
    levels_hash_file: Path
    levels_index_file: Path
    background_dir: Path
    webui_dist_dir: Path


def get_settings() -> AppSettings:
    config = read_app_config()
    server_config = config.get("server", {})
    level_config = config.get("level", {})
    path_config = config.get("path", {})
    background_config = config.get("background", {})
    return AppSettings(
        backend_port=clamp_integer(
            server_config.get("backendPort") or server_config.get("port"),
            DEFAULT_BACKEND_PORT,
            1,
            65535,
        ),
        developer_token=str(
            server_config.get("su-token")
            or server_config.get("suToken")
            or server_config.get("devToken")
            or server_config.get("dev-token")
            or ""
        ).strip(),
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
        levels_dir=resolve_config_path(path_config.get("levels") or level_config.get("path") or "data/levels"),
        levels_hash_file=resolve_config_path(
            path_config.get("levelsHash") or path_config.get("levels_hash") or "data/levels-hash.json"
        ),
        levels_index_file=resolve_config_path(
            path_config.get("levelsIndex") or path_config.get("levels_index") or "data/levels-index.json"
        ),
        background_dir=resolve_config_path(
            path_config.get("background") or background_config.get("path") or "background"
        ),
        webui_dist_dir=resolve_config_path(path_config.get("webuiDist") or "webui/dist"),
    )


def read_app_config() -> dict[str, Any]:
    if not CONFIG_PATH.is_file():
        return {}
    source = CONFIG_PATH.read_text(encoding="utf-8")
    loaded = yaml.safe_load(source) or {}
    return loaded if isinstance(loaded, dict) else {}


def resolve_config_path(value: Any) -> Path:
    path = Path(str(value)).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (PROJECT_ROOT / path).resolve()


def clamp_integer(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, number))
