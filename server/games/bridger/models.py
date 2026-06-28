from __future__ import annotations

from typing import TypedDict


class IslandData(TypedDict):
    id: str
    x: int
    y: int
    value: int


class LevelData(TypedDict):
    id: str
    name: str
    difficulty: int
    gridType: str
    width: int
    height: int
    islands: list[IslandData]
    sourcePath: str
    sourceCategory: str


class LevelIndexItem(TypedDict):
    id: str
    name: str
    difficulty: int
    sourcePath: str
    sourceCategory: str
