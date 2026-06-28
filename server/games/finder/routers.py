from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from server.games.finder.generator import generate_editor_level
from server.games.finder.good_checker import check_level_good
from server.games.finder.services import (
    get_level_save_rate_limit,
    mark_level_save_started,
    read_level_answers,
    read_level_by_id,
    read_level_by_source_path,
    read_level_index,
    refresh_level_index,
    reset_level_save_marker,
    review_test_level,
    save_level,
)
from server.utils.http import http_error, read_json_body
from server.utils.security import authorize_developer_request, get_bearer_token

play_router = APIRouter(prefix="/api/play/finder", tags=["finder-play"])
editor_router = APIRouter(prefix="/api/editor/finder", tags=["finder-editor"])


def get_visible_levels(request: Request, levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    has_developer_token = bool(get_bearer_token(request))
    if has_developer_token:
        authorize_developer_request(request)
        return [level for level in levels if level.get("sourceCategory") != "removed"]
    return [level for level in levels if level.get("sourceCategory") == "stable"]


@play_router.get("/levels/index", summary="List finder level index")
async def get_levels_index(request: Request) -> list[dict[str, Any]]:
    return get_visible_levels(request, read_level_index())


@play_router.get("/levels/{level_id}", summary="Get finder level detail")
async def get_level_detail(level_id: str, request: Request) -> dict[str, Any]:
    level = read_level_by_id(level_id)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return level


@play_router.get("/level", summary="Get finder level detail by source path")
async def get_level_detail_by_source_path(path: str, request: Request) -> dict[str, Any]:
    level = read_level_by_source_path(path)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return level


@play_router.get("/level/answers", summary="Get finder answers by source path")
async def get_level_answers(path: str, request: Request) -> dict[str, Any]:
    level = read_level_by_source_path(path)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return {"levelId": level.get("id"), "answers": read_level_answers(level)}


@editor_router.post("/levels/index/rebuild", summary="Rebuild finder level index")
async def rebuild_levels_index(request: Request) -> list[dict[str, Any]]:
    authorize_developer_request(request)
    return refresh_level_index()


@editor_router.post("/levels/generate", summary="Generate a finder editor level")
async def generate_level(request: Request) -> dict[str, Any]:
    authorize_developer_request(request)
    payload = await read_json_body(request)
    return generate_editor_level(payload)


@editor_router.post("/levels/check-good", summary="Check finder level good paths")
async def check_good_level(request: Request) -> dict[str, Any]:
    authorize_developer_request(request)
    payload = await read_json_body(request)
    level = payload.get("map") if isinstance(payload.get("map"), dict) else payload
    answer_payload = payload.get("answers")
    answers = answer_payload.get("answers") if isinstance(answer_payload, dict) else payload.get("answers")
    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    return check_level_good(level, answers, options)


@editor_router.post("/levels", summary="Create or update a finder level")
async def post_level(request: Request) -> dict[str, Any]:
    authorize_developer_request(request)
    rate_limit = get_level_save_rate_limit()
    if rate_limit["isLimited"]:
        raise http_error(
            429,
            "Too many requests",
            f"保存太频繁，请 {rate_limit['retryAfterSeconds']} 秒后再试",
            retryAfterSeconds=rate_limit["retryAfterSeconds"],
        )

    save_started_at = mark_level_save_started()
    try:
        level = await read_json_body(request)
        return save_level(level)
    except Exception:
        reset_level_save_marker(save_started_at)
        raise


@editor_router.post("/levels/review", summary="Review a finder test level")
async def review_level(request: Request) -> dict[str, Any]:
    authorize_developer_request(request)
    review = await read_json_body(request)
    return review_test_level(review)
