from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from server.config import get_settings


def http_error(status_code: int, error: str, message: str, **extra: Any) -> HTTPException:
    """构造统一 JSON 结构的 HTTP 异常。"""
    return HTTPException(status_code=status_code, detail={"error": error, "message": message, **extra})


async def read_json_body(request: Request) -> dict[str, Any]:
    """读取并校验请求体，要求其为 JSON 对象且不超过配置大小。"""
    max_body_bytes = get_settings().max_request_body_bytes
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_body_bytes:
        raise http_error(413, "Payload Too Large", "请求体过大")
    body = await request.body()
    if len(body) > max_body_bytes:
        raise http_error(413, "Payload Too Large", "请求体过大")
    if not body:
        return {}
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise http_error(400, "Bad Request", str(error)) from error
    if not isinstance(payload, dict):
        raise http_error(400, "Bad Request", "请求体必须是 JSON 对象")
    return payload


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """把 FastAPI HTTPException 转成前端统一的 JSON 错误格式。"""
    if isinstance(exc.detail, dict):
        return JSONResponse(exc.detail, status_code=exc.status_code)
    return JSONResponse({"error": exc.detail, "message": exc.detail}, status_code=exc.status_code)
