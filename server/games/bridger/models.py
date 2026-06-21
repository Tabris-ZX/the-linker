from __future__ import annotations

from typing import TypedDict


class BridgeIsland(TypedDict):
    id: str
    x: int
    y: int
    value: int


class BridgeLevel(TypedDict):
    id: str
    name: str
    difficulty: int
    width: int
    height: int
    islands: list[BridgeIsland]


class BridgeLevelIndexItem(TypedDict):
    id: str
    name: str
    difficulty: int
