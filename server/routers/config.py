from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["config"])

# Intentionally no public config endpoints. Frontend config is injected by nginx.
