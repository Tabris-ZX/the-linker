from __future__ import annotations

from fastapi import APIRouter, Request

from server.utils.security import authorize_developer_request

router = APIRouter(prefix="/api", tags=["verify"])


@router.post("/developer/verify", summary="Verify developer token")
async def verify_developer(request: Request) -> dict[str, bool]:
    authorize_developer_request(request)
    return {"ok": True}
