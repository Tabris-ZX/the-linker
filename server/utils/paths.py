from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import HTTPException


def normalize_path(value: Any) -> str:
    """把系统路径分隔符统一成 `/`。"""
    return str(value).replace(os.sep, "/")


def safe_child_path(directory: Path, requested_path: str) -> Path:
    """返回 `directory` 下的安全子路径，阻止目录穿越。"""
    base = directory.resolve()
    file_path = (base / requested_path).resolve()
    if file_path != base and base not in file_path.parents:
        raise HTTPException(status_code=403, detail="Forbidden")
    return file_path
