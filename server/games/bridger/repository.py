from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator

from server.config import get_settings
from server.games.bridger.models import BridgeLevel, BridgeLevelIndexItem


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    database_file = get_settings().bridger_sqlite_database_file
    database_file.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_file)
    connection.row_factory = sqlite3.Row
    try:
        ensure_schema(connection)
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS bridge_levels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          difficulty INTEGER NOT NULL DEFAULT 1,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          islands JSON NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bridge_levels_difficulty_id
          ON bridge_levels(difficulty, id)
        """
    )


def count_levels() -> int:
    with connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS total FROM bridge_levels").fetchone()
    return int(row["total"] or 0)


def read_level_index() -> list[BridgeLevelIndexItem]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, difficulty
            FROM bridge_levels
            ORDER BY difficulty, id
            """
        ).fetchall()
    return [index_item_from_row(row) for row in rows]


def read_level(level_id: str) -> BridgeLevel | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM bridge_levels WHERE id = ?",
            (level_id,),
        ).fetchone()
    return level_from_row(row) if row else None


def write_level(level: BridgeLevel) -> BridgeLevel:
    normalized = normalize_level(level)
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO bridge_levels (id, name, difficulty, width, height, islands, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              difficulty = excluded.difficulty,
              width = excluded.width,
              height = excluded.height,
              islands = excluded.islands,
              updated_at = excluded.updated_at
            """,
            (
                normalized["id"],
                normalized["name"],
                normalized["difficulty"],
                normalized["width"],
                normalized["height"],
                json_text(normalized["islands"]),
                utc_now(),
            ),
        )
    return normalized


def next_level_id(difficulty: int) -> str:
    prefix = str(clamp_int(difficulty, 1, 5))
    with connect() as connection:
        rows = connection.execute(
            "SELECT id FROM bridge_levels WHERE id LIKE ?",
            (f"bridge-{prefix}-%",),
        ).fetchall()
    used = set()
    for row in rows:
        suffix = str(row["id"]).rsplit("-", 1)[-1]
        if suffix.isdigit():
            used.add(int(suffix))
    for number in range(1, 1000):
        if number not in used:
            return f"bridge-{prefix}-{number:03d}"
    raise RuntimeError("No bridge level ids left")


def normalize_level(level: BridgeLevel) -> BridgeLevel:
    difficulty = clamp_int(level.get("difficulty", 1), 1, 5)
    width = clamp_int(level.get("width", 7), 2, 30)
    height = clamp_int(level.get("height", 7), 2, 30)
    islands = []
    seen_ids: set[str] = set()
    for index, island in enumerate(level.get("islands", [])):
        if not isinstance(island, dict):
            continue
        island_id = str(island.get("id") or f"i{index + 1}")
        if island_id in seen_ids:
            island_id = f"{island_id}-{index + 1}"
        seen_ids.add(island_id)
        islands.append({
            "id": island_id,
            "x": clamp_int(island.get("x", 0), 0, width),
            "y": clamp_int(island.get("y", 0), 0, height),
            "value": clamp_int(island.get("value", 1), 0, 8),
        })
    return {
        "id": str(level.get("id") or next_level_id(difficulty)),
        "name": str(level.get("name") or level.get("id") or "数桥关卡"),
        "difficulty": difficulty,
        "width": width,
        "height": height,
        "islands": islands,
    }


def index_item_from_row(row: sqlite3.Row) -> BridgeLevelIndexItem:
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "difficulty": int(row["difficulty"] or 1),
    }


def level_from_row(row: sqlite3.Row) -> BridgeLevel:
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "difficulty": int(row["difficulty"] or 1),
        "width": int(row["width"] or 1),
        "height": int(row["height"] or 1),
        "islands": json_list(row["islands"]),
    }


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = minimum
    return min(maximum, max(minimum, number))


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
