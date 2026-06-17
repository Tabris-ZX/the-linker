from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

from server.config import get_settings
from server.routers import levels, stats, verify
from server.utils.http import http_exception_handler

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(levelprefix)s %(message)s",
            "use_colors": None,
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
        "uvicorn.error": {"handlers": ["default"], "level": "INFO", "propagate": False},
        "uvicorn.access": {"handlers": ["default"], "level": "WARNING", "propagate": False},
        "server": {"handlers": ["default"], "level": "INFO", "propagate": False},
    },
}

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def append_vary_header(current_value: str | None, header_name: str) -> str:
    """向 `Vary` 响应头追加字段，避免重复写入。"""
    values = [value.strip() for value in (current_value or "").split(",") if value.strip()]
    if not any(value.lower() == header_name.lower() for value in values):
        values.append(header_name)
    return ", ".join(values)


def create_app() -> FastAPI:
    """构建 FastAPI 应用并注册全局中间件、异常处理器和路由。"""
    app = FastAPI(title="The Linker Server")
    app.add_exception_handler(HTTPException, http_exception_handler)

    @app.middleware("http")
    async def add_cache_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Vary"] = append_vary_header(response.headers.get("Vary"), "Authorization")
        return response

    app.include_router(levels.router)
    app.include_router(stats.router)
    app.include_router(verify.router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=get_settings().backend_port,
        reload=False,
        log_config=LOGGING_CONFIG,
        access_log=False,
    )
