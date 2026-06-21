from __future__ import annotations

from fastapi import APIRouter, Request

from server.security import authorize_developer_request, get_bearer_token
from server.games.linker.services.generator import generate_editor_level
from server.games.linker.services.good_checker import check_level_good
from server.games.linker.services.levels import (
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

router = APIRouter(prefix="/api/linker", tags=["linker-levels"])


def get_visible_levels(request: Request, levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按访问权限过滤关卡目录。"""
    has_developer_token = bool(get_bearer_token(request))
    if has_developer_token:
        authorize_developer_request(request)
        return [level for level in levels if level.get("sourceCategory") != "removed"]
    return [level for level in levels if level.get("sourceCategory") == "stable"]


@router.get("/levels/index", summary="List level index")
async def get_levels_index(request: Request) -> list[dict[str, Any]]:
    """读取关卡目录。

    目录只包含 id、名称、难度和来源路径，不包含 pairs、answers 等完整关卡内容。
    前端可先用目录渲染关卡列表；玩家打开某关时，再调用 /api/levels/{id} 或 /api/level 读取游玩详情。
    """
    return get_visible_levels(request, read_level_index())


@router.post("/levels/index/rebuild", summary="Rebuild level index")
async def rebuild_levels_index(request: Request) -> list[dict[str, Any]]:
    """重建关卡目录索引。

    需要开发者 Bearer Token。用于手动修改关卡 JSON 后刷新 data/levels-index.json 和内存目录缓存。
    """
    authorize_developer_request(request)
    return refresh_level_index()


@router.post("/levels/generate", summary="Generate an editor level")
async def generate_level(request: Request) -> dict[str, Any]:
    """调用完整生成器生成一张可载入编辑器的临时关卡。

    需要开发者 Bearer Token。该接口只返回 map/answers，不写入 alpha 目录。
    """
    authorize_developer_request(request)
    payload = await read_json_body(request)
    return generate_editor_level(payload)


@router.post("/levels/check-good", summary="Check whether a square level has good authored paths")
async def check_good_level(request: Request) -> dict[str, Any]:
    """检查方格关卡答案是否为好解。

    需要开发者 Bearer Token。请求体为 { map, answers, options }。
    """
    authorize_developer_request(request)
    payload = await read_json_body(request)
    level = payload.get("map") if isinstance(payload.get("map"), dict) else payload
    answer_payload = payload.get("answers")
    answers = answer_payload.get("answers") if isinstance(answer_payload, dict) else payload.get("answers")
    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    return check_level_good(level, answers, options)


@router.get("/levels/{level_id}", summary="Get level detail")
async def get_level_detail(level_id: str, request: Request) -> dict[str, Any]:
    """按 id 读取完整关卡。

    未授权用户只能读取 stable 关卡；带有效开发者 Token 时可读取 alpha 和 removed 关卡。
    """
    level = read_level_by_id(level_id)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return level


@router.get("/level", summary="Get level detail by source path")
async def get_level_detail_by_source_path(path: str, request: Request) -> dict[str, Any]:
    """按 sourcePath 读取完整关卡。

    sourcePath 可区分 stable/1001.json 和 alpha/1001-tmp.json 这类不同目录关卡。
    未授权用户只能读取 stable 关卡；带有效开发者 Token 时可读取 alpha 和 removed 关卡。
    """
    level = read_level_by_source_path(path)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return level


@router.get("/level/answers", summary="Get editor answers by source path")
async def get_level_answers(path: str, request: Request) -> dict[str, Any]:
    """读取编辑器答案线路。

    stable 关卡可供提示按钮按需读取；alpha 关卡仍需要开发者 Bearer Token。
    """
    level = read_level_by_source_path(path)
    if level.get("sourceCategory") != "stable":
        authorize_developer_request(request)
    return {"levelId": level.get("id"), "answers": read_level_answers(level)}


@router.post("/levels", summary="Create or update a level")
async def post_level(request: Request) -> dict[str, Any]:
    """保存关卡。

    需要开发者 Bearer Token。请求体为关卡 JSON，saveMode=create 时写入 alpha 目录并自动分配 id，
    saveMode=update 时更新已有关卡文件。保存前会执行频率限制和关卡哈希去重。
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

    需要开发者 Bearer Token。action=include 会把 alpha 关卡移动到 stable，
    action=reject 会把 alpha 关卡移动到 removed，并刷新关卡哈希索引。收录时会重新分配正式关卡 id。
    """
    authorize_developer_request(request)
    review = await read_json_body(request)
    return review_test_level(review)
