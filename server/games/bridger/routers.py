from __future__ import annotations

from fastapi import APIRouter, Request

from server.games.bridger.services import (
    read_level,
    read_level_by_source_path,
    read_level_index,
    refresh_level_index,
    save_level,
)
from server.utils.security import authorize_developer_request
from server.utils.http import read_json_body

play_router = APIRouter(prefix="/api/play/bridger", tags=["bridger-play"])
editor_router = APIRouter(prefix="/api/editor/bridger", tags=["bridger-editor"])


@play_router.get("/levels/index", summary="List bridger level index")
async def get_levels_index() -> list[dict]:
    return read_level_index()


@play_router.get("/levels/{level_id}", summary="Get bridger level detail")
async def get_level_detail(level_id: str) -> dict:
    return read_level(level_id)


@play_router.get("/level", summary="Get bridger level detail by source path")
async def get_level_detail_by_source_path(path: str) -> dict:
    return read_level_by_source_path(path)


@editor_router.post("/levels/index/rebuild", summary="Rebuild bridger level index")
async def rebuild_levels_index(request: Request) -> list[dict]:
    authorize_developer_request(request)
    return refresh_level_index()


@editor_router.post("/levels", summary="Create or update bridger level")
async def post_level(request: Request) -> dict:
    authorize_developer_request(request)
    payload = await read_json_body(request)
    return save_level(payload)
