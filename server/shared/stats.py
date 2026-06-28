from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Request

from server.utils.security import authorize_developer_request

router = APIRouter(prefix="/api", tags=["stats"])

PRESENCE_TTL_SECONDS = 30
presence_clients: dict[str, float] = {}


def prune_presence(now: float) -> None:
    expired_ids = [
        client_id
        for client_id, seen_at in presence_clients.items()
        if now - seen_at > PRESENCE_TTL_SECONDS
    ]
    for client_id in expired_ids:
        presence_clients.pop(client_id, None)


@router.post("/stats/presence", summary="Update online heartbeat")
async def update_presence(request: Request) -> dict[str, Any]:
    payload = await request.json()
    client_id = str(payload.get("clientId") or "").strip() or uuid.uuid4().hex
    now = time.time()
    prune_presence(now)
    presence_clients[client_id] = now
    return {
        "clientId": client_id,
        "ttlSeconds": PRESENCE_TTL_SECONDS,
    }


@router.get("/stats/presence", summary="Read online users")
async def read_presence(request: Request) -> dict[str, Any]:
    authorize_developer_request(request)
    now = time.time()
    prune_presence(now)
    return {
        "onlineCount": len(presence_clients),
        "ttlSeconds": PRESENCE_TTL_SECONDS,
    }
