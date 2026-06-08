from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from server.config import get_settings
from server.paths import safe_child_path

router = APIRouter(tags=["web"])


@router.get("/{full_path:path}", include_in_schema=False)
@router.head("/{full_path:path}", include_in_schema=False)
async def webui(full_path: str) -> Any:
    """提供前端静态文件。

    本地直接运行 FastAPI 时使用 webui/dist 作为静态站点目录。非 index.html 文件命中则直接返回；
    其他前端路由回退到 index.html。api/ 前缀不在这里兜底，避免吞掉接口 404。
    """
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    webui_dist_dir = get_settings().webui_dist_dir
    file_path = safe_child_path(webui_dist_dir, full_path or "index.html")
    if file_path.is_file() and file_path.name != "index.html":
        return FileResponse(file_path)
    index_path = webui_dist_dir / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=503, detail="webui/dist/index.html not found. Run `npm run build` in webui first.")
    return FileResponse(
        index_path,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )
