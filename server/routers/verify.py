from __future__ import annotations

from fastapi import APIRouter, Request

from server.security import authorize_developer_request

router = APIRouter(prefix="/api", tags=["verify"])


@router.post("/developer/verify", summary="Verify developer token")
async def verify_developer(request: Request) -> dict[str, bool]:
    """校验开发者 Token。

    请求头必须包含 Authorization: Bearer <token>。校验成功返回 {"ok": true}，
    校验失败会记录失败次数并在达到上限后进入临时锁定。
    """
    authorize_developer_request(request)
    return {"ok": True}
