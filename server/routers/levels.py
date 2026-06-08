from __future__ import annotations

from fastapi import APIRouter, Request

from server.security import authorize_developer_request, get_bearer_token
from server.services.levels import (
    get_level_save_rate_limit,
    mark_level_save_started,
    read_level_by_id,
    read_level_by_source_path,
    read_level_index,
    reset_level_save_marker,
    review_test_level,
    save_level,
)
from server.utils.http import http_error, read_json_body

router = APIRouter(prefix="/api", tags=["levels"])


def get_visible_levels(request: Request, levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    has_developer_token = bool(get_bearer_token(request))
    if has_developer_token:
        authorize_developer_request(request)
        return levels
    return [level for level in levels if level.get("sourceCategory") == "official"]


@router.get("/levels/index", summary="List level index")
async def get_levels_index(request: Request) -> list[dict[str, Any]]:
    """读取关卡目录。

    目录只包含 id、名称、难度、来源、网格尺寸等轻量信息，不包含 pairs、answers 等完整关卡内容。
    前端可先用目录渲染关卡列表；玩家打开某关或编辑器选择某关时，再调用 /api/levels/{id} 读取详情。
    """
    return get_visible_levels(request, read_level_index())


@router.get("/levels/{level_id}", summary="Get level detail")
async def get_level_detail(level_id: str, request: Request) -> dict[str, Any]:
    """按 id 读取完整关卡。

    未授权用户只能读取 official 关卡；带有效开发者 Token 时可读取 tests 和 deleted 关卡。
    """
    level = read_level_by_id(level_id)
    if level.get("sourceCategory") != "official":
        authorize_developer_request(request)
    return level


@router.get("/level", summary="Get level detail by source path")
async def get_level_detail_by_source_path(path: str, request: Request) -> dict[str, Any]:
    """按 sourcePath 读取完整关卡。

    sourcePath 可区分 official/level-001.json 和 tests/level-001.json 这类同 id 关卡。
    未授权用户只能读取 official 关卡；带有效开发者 Token 时可读取 tests 和 deleted 关卡。
    """
    level = read_level_by_source_path(path)
    if level.get("sourceCategory") != "official":
        authorize_developer_request(request)
    return level


@router.post("/levels", summary="Create or update a level")
async def post_level(request: Request) -> dict[str, Any]:
    """保存关卡。

    需要开发者 Bearer Token。请求体为关卡 JSON，saveMode=create 时写入 tests 目录并自动分配 id，
    saveMode=update 时更新已有 level-xxx 文件。保存前会执行频率限制和关卡哈希去重。
    """
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


@router.post("/levels/review", summary="Review a test level")
async def review_level(request: Request) -> dict[str, Any]:
    """审核测试关卡。

    需要开发者 Bearer Token。action=include 会把 tests 关卡移动到 official，
    action=reject 会把 tests 关卡移动到 deleted，并刷新关卡哈希索引。
    """
    authorize_developer_request(request)
    review = await read_json_body(request)
    return review_test_level(review)
