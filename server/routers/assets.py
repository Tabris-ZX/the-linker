from __future__ import annotations

import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from server.config import get_settings
from server.paths import safe_child_path

router = APIRouter(tags=["assets"])


@router.get("/background/{asset_path:path}", summary="Serve background asset")
@router.head("/background/{asset_path:path}", summary="Check background asset")
async def background_asset(asset_path: str) -> FileResponse:
    """读取背景资源。

    asset_path 是相对背景目录的资源路径。服务端会通过 safe_child_path 阻止路径穿越，
    文件不存在时返回 404，存在时根据扩展名推断响应类型。
    """
    background_dir = get_settings().background_dir
    file_path = safe_child_path(background_dir, asset_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path, media_type=mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
