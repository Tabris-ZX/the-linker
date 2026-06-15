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
    """校验开发者请求，失败时按锁定状态返回 401 或 429。"""
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
    """验证请求中的 Bearer Token，并维护失败次数与锁定状态。"""
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
    """记录一次开发者鉴权失败。"""
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
    """读取某个客户端当前是否处于鉴权锁定状态。"""
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
    """从转发头或直连地址中提取用于限流的客户端标识。"""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    return forwarded_for.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")


def get_developer_token() -> str:
    """读取配置中的开发者 token。"""
    return get_settings().developer_token


def get_bearer_token(request: Request) -> str:
    """从 Authorization 头中提取 Bearer token。"""
    matched = re.match(r"^Bearer\s+(.+)$", request.headers.get("authorization", "").strip(), flags=re.IGNORECASE)
    return matched.group(1).strip() if matched else ""
