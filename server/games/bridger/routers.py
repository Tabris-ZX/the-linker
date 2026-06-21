from __future__ import annotations

from fastapi import APIRouter, Request

from server.games.bridger.services import read_bridge_level, read_bridge_level_index, save_bridge_level
from server.security import authorize_developer_request
from server.utils.http import read_json_body

router = APIRouter(prefix="/api/bridger", tags=["bridger-levels"])


@router.get("/levels/index", summary="List bridger level index")
async def get_bridge_levels_index() -> list[dict]:
    return read_bridge_level_index()


@router.get("/levels/{level_id}", summary="Get bridger level detail")
async def get_bridge_level_detail(level_id: str) -> dict:
    return read_bridge_level(level_id)


@router.post("/levels", summary="Create or update bridger level")
async def post_bridge_level(request: Request) -> dict:
    authorize_developer_request(request)
    payload = await read_json_body(request)
    return save_bridge_level(payload)
