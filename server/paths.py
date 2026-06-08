from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import HTTPException


def normalize_path(value: Any) -> str:
    return str(value).replace(os.sep, "/")


def safe_child_path(directory: Path, requested_path: str) -> Path:
    base = directory.resolve()
    file_path = (base / requested_path).resolve()
    if file_path != base and base not in file_path.parents:
        raise HTTPException(status_code=403, detail="Forbidden")
    return file_path
