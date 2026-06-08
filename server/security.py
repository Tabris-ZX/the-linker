from __future__ import annotations

import hmac
import math
import re
import time
from typing import Any

from fastapi import Request

from server.config import get_settings
from server.utils.http import http_error

developer_auth_failures: dict[str, dict[str, float | int]] = {}


def authorize_developer_request(request: Request) -> None:
    auth = verify_developer_request(request)
    if auth["ok"]:
        return
    if auth["isLocked"]:
        raise http_error(
            429,
            "Too many requests",
            f"开发者 token 错误次数过多，请 {auth['retryAfterSeconds']} 秒后再试",
            retryAfterSeconds=auth["retryAfterSeconds"],
        )
    message = "开发者 token 无效" if get_developer_token() else "未配置 server.su-token"
    raise http_error(401, "Unauthorized", message)


def verify_developer_request(request: Request, record_failure: bool = True) -> dict[str, Any]:
    expected_token = get_developer_token()
    provided_token = get_bearer_token(request)
    client_key = get_developer_auth_client_key(request)
    lock = get_developer_auth_lock(client_key)
    if lock["isLocked"]:
        return {"ok": False, **lock}

    is_authorized = bool(expected_token and provided_token and hmac.compare_digest(expected_token, provided_token))
    if is_authorized:
        developer_auth_failures.pop(client_key, None)
        return {"ok": True, "isLocked": False, "retryAfterSeconds": 0}

    if record_failure and provided_token:
        return record_developer_auth_failure(client_key)
    return {"ok": False, "isLocked": False, "retryAfterSeconds": 0}


def record_developer_auth_failure(client_key: str) -> dict[str, Any]:
    settings = get_settings()
    current = developer_auth_failures.get(client_key, {})
    failed_attempts = int(current.get("failedAttempts", 0)) + 1
    if failed_attempts >= settings.developer_auth_max_failed_attempts:
        developer_auth_failures[client_key] = {
            "failedAttempts": failed_attempts,
            "lockedUntil": time.time() + settings.developer_auth_lock_seconds,
        }
        return {"ok": False, "isLocked": True, "retryAfterSeconds": settings.developer_auth_lock_seconds}
    developer_auth_failures[client_key] = {"failedAttempts": failed_attempts, "lockedUntil": 0}
    return {"ok": False, "isLocked": False, "retryAfterSeconds": 0}


def get_developer_auth_lock(client_key: str) -> dict[str, Any]:
    current = developer_auth_failures.get(client_key, {})
    locked_until = float(current.get("lockedUntil") or 0)
    if not locked_until:
        return {"isLocked": False, "retryAfterSeconds": 0}
    remaining = locked_until - time.time()
    if remaining <= 0:
        developer_auth_failures.pop(client_key, None)
        return {"isLocked": False, "retryAfterSeconds": 0}
    return {"isLocked": True, "retryAfterSeconds": math.ceil(remaining)}


def get_developer_auth_client_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    return forwarded_for.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")


def get_developer_token() -> str:
    return get_settings().developer_token


def get_bearer_token(request: Request) -> str:
    matched = re.match(r"^Bearer\s+(.+)$", request.headers.get("authorization", "").strip(), flags=re.IGNORECASE)
    return matched.group(1).strip() if matched else ""
