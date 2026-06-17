from __future__ import annotations

from typing import Any, TypedDict


class LevelPair(TypedDict, total=False):
    id: str
    points: list[list[int]]


class LevelData(TypedDict, total=False):
    id: str
    name: str
    difficulty: int
    gridType: str
    width: int
    height: int
    pairs: list[LevelPair]
    removedEdges: list[Any]
    sourcePath: str
    sourceCategory: str
    answers: list[Any]
    levelHash: str
    levelCanonical: str
    saveMode: str


class LevelIndexItem(TypedDict):
    id: str
    name: str | None
    difficulty: int
    sourcePath: str
    sourceCategory: str


class AnswerData(TypedDict, total=False):
    levelId: str
    answers: list[Any]


class ReviewData(TypedDict, total=False):
    levelId: str
    sourcePath: str
    action: str
