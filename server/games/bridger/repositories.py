from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator

from server.config import get_settings
from server.games.bridger.models import LevelData, LevelIndexItem
from server.utils.paths import normalize_path

CATEGORIES = {"stable", "alpha", "removed"}
SCHEMA_VERSION = 3


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    database_file = get_settings().bridger_sqlite_database_file
    database_file.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_file)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
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
    connection.execute("PRAGMA foreign_keys = OFF")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS levels (
          id TEXT NOT NULL,
          name TEXT,
          status TEXT NOT NULL DEFAULT 'stable',
          difficulty INTEGER NOT NULL DEFAULT 1,
          grid_type TEXT NOT NULL DEFAULT 'bridger',
          width INTEGER,
          height INTEGER,
          pairs JSON NOT NULL DEFAULT '[]',
          removed_edges JSON NOT NULL DEFAULT '[]',
          payload JSON NOT NULL DEFAULT '{}',
          level_hash TEXT,
          level_canonical TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (status, id)
        );

        CREATE TABLE IF NOT EXISTS answers (
          level_status TEXT NOT NULL,
          level_id TEXT NOT NULL,
          answer JSON NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (level_status, level_id),
          FOREIGN KEY (level_status, level_id)
            REFERENCES levels(status, id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
        );
        """
    )
    migrate_bridge_levels(connection)
    migrate_existing_levels_table(connection)
    migrate_existing_answers_table(connection)
    connection.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_levels_status_difficulty_id
          ON levels(status, difficulty, id);
        CREATE INDEX IF NOT EXISTS idx_levels_id
          ON levels(id);
        CREATE INDEX IF NOT EXISTS idx_levels_hash
          ON levels(level_hash);
        CREATE INDEX IF NOT EXISTS idx_answers_level
          ON answers(level_status, level_id);
        """
    )
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )


def migrate_bridge_levels(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bridge_levels'"
    ).fetchone()
    if not row:
        return
    rows = connection.execute("SELECT * FROM bridge_levels").fetchall()
    for item in rows:
        level = {
            "id": str(item["id"]),
            "name": str(item["name"]),
            "difficulty": int(item["difficulty"] or 1),
            "gridType": "bridger",
            "width": int(item["width"] or 1),
            "height": int(item["height"] or 1),
            "islands": json_list(item["islands"]),
        }
        connection.execute(
            """
            INSERT OR IGNORE INTO levels (
              id, name, status, difficulty, grid_type, width, height,
              pairs, removed_edges, payload, level_hash, level_canonical, updated_at
            )
            VALUES (?, ?, 'stable', ?, 'bridger', ?, ?, '[]', '[]', ?, NULL, NULL, ?)
            """,
            (
                level["id"],
                level["name"],
                level["difficulty"],
                level["width"],
                level["height"],
                json_text(level),
                item["updated_at"] or utc_now(),
            ),
        )
    connection.execute("DROP TABLE bridge_levels")


def migrate_existing_levels_table(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(levels)").fetchall()}
    required = {
        "id",
        "name",
        "status",
        "difficulty",
        "grid_type",
        "width",
        "height",
        "pairs",
        "removed_edges",
        "payload",
        "level_hash",
        "level_canonical",
        "updated_at",
    }
    if required.issubset(columns):
        return
    rows = connection.execute("SELECT * FROM levels").fetchall()
    connection.executescript(
        """
        DROP TABLE IF EXISTS levels_new;
        CREATE TABLE levels_new (
          id TEXT NOT NULL,
          name TEXT,
          status TEXT NOT NULL DEFAULT 'stable',
          difficulty INTEGER NOT NULL DEFAULT 1,
          grid_type TEXT NOT NULL DEFAULT 'bridger',
          width INTEGER,
          height INTEGER,
          pairs JSON NOT NULL DEFAULT '[]',
          removed_edges JSON NOT NULL DEFAULT '[]',
          payload JSON NOT NULL DEFAULT '{}',
          level_hash TEXT,
          level_canonical TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (status, id)
        );
        """
    )
    for row in rows:
        payload = json_obj(row_value(row, columns, "payload", "{}"))
        connection.execute(
            """
            INSERT OR REPLACE INTO levels_new (
              id, name, status, difficulty, grid_type, width, height,
              pairs, removed_edges, payload, level_hash, level_canonical, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(row_value(row, columns, "id", "")),
                row_value(row, columns, "name"),
                normalize_category(row_value(row, columns, "status", "stable")),
                nullable_int(row_value(row, columns, "difficulty")) or 1,
                str(row_value(row, columns, "grid_type", payload.get("gridType") or "bridger") or "bridger"),
                nullable_int(row_value(row, columns, "width")),
                nullable_int(row_value(row, columns, "height")),
                row_value(row, columns, "pairs", "[]"),
                row_value(row, columns, "removed_edges", "[]"),
                json_text(payload),
                row_value(row, columns, "level_hash"),
                row_value(row, columns, "level_canonical"),
                row_value(row, columns, "updated_at") or utc_now(),
            ),
        )
    connection.execute("DROP TABLE levels")
    connection.execute("ALTER TABLE levels_new RENAME TO levels")


def migrate_existing_answers_table(connection: sqlite3.Connection) -> None:
    rows = connection.execute("PRAGMA table_info(answers)").fetchall()
    columns = {row["name"] for row in rows}
    primary_key_columns = [row["name"] for row in sorted(rows, key=lambda item: item["pk"]) if row["pk"]]
    foreign_tables = {row["table"] for row in connection.execute("PRAGMA foreign_key_list(answers)").fetchall()}
    if (
        {"level_status", "level_id", "answer", "updated_at"}.issubset(columns)
        and "id" not in columns
        and primary_key_columns == ["level_status", "level_id"]
        and foreign_tables == {"levels"}
    ):
        return
    legacy_rows = connection.execute("SELECT * FROM answers").fetchall() if columns else []
    connection.executescript(
        """
        DROP TABLE IF EXISTS answers_new;
        CREATE TABLE answers_new (
          level_status TEXT NOT NULL,
          level_id TEXT NOT NULL,
          answer JSON NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (level_status, level_id),
          FOREIGN KEY (level_status, level_id)
            REFERENCES levels(status, id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
        );
        """
    )
    for row in legacy_rows:
        level_status = row["level_status"] if "level_status" in columns else None
        level_id = row["level_id"] if "level_id" in columns else None
        if level_status is None or level_id is None:
            continue
        connection.execute(
            """
            INSERT OR REPLACE INTO answers_new (level_status, level_id, answer, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                level_status,
                level_id,
                row["answer"] if "answer" in columns else "[]",
                row["updated_at"] if "updated_at" in columns else utc_now(),
            ),
        )
    if columns:
        connection.execute("DROP TABLE answers")
    connection.execute("ALTER TABLE answers_new RENAME TO answers")


def read_level_index() -> list[LevelIndexItem]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, status, difficulty
            FROM levels
            ORDER BY
              CASE status WHEN 'stable' THEN 0 WHEN 'alpha' THEN 1 WHEN 'removed' THEN 2 ELSE 9 END,
              id
            """
        ).fetchall()
    return [index_item_from_row(row) for row in rows]


def read_level(level_id: str) -> LevelData | None:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM levels
            WHERE id = ?
            ORDER BY CASE status WHEN 'stable' THEN 0 WHEN 'alpha' THEN 1 WHEN 'removed' THEN 2 ELSE 9 END
            LIMIT 1
            """,
            (level_id,),
        ).fetchone()
    return level_from_row(row) if row else None


def read_level_by_source_path(source_path: str) -> LevelData | None:
    category, level_id = split_source_path(source_path)
    if not category or not level_id:
        return None
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM levels WHERE status = ? AND id = ?",
            (category, level_id),
        ).fetchone()
    return level_from_row(row) if row else None


def write_level(level: LevelData, category: str = "stable", answers: list[Any] | None = None) -> LevelData:
    normalized = normalize_level(level)
    now = utc_now()
    normalized_category = normalize_category(category)
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO levels (
              id, name, status, difficulty, grid_type, width, height,
              pairs, removed_edges, payload, level_hash, level_canonical, updated_at
            )
            VALUES (?, ?, ?, ?, 'bridger', ?, ?, '[]', '[]', ?, NULL, NULL, ?)
            ON CONFLICT(status, id) DO UPDATE SET
              name = excluded.name,
              difficulty = excluded.difficulty,
              grid_type = excluded.grid_type,
              width = excluded.width,
              height = excluded.height,
              pairs = excluded.pairs,
              removed_edges = excluded.removed_edges,
              payload = excluded.payload,
              updated_at = excluded.updated_at
            """,
            (
                normalized["id"],
                normalized["name"],
                normalized_category,
                normalized["difficulty"],
                normalized["width"],
                normalized["height"],
                json_text(storage_payload(normalized)),
                now,
            ),
        )
        if answers is not None:
            connection.execute(
                """
                INSERT INTO answers (level_status, level_id, answer, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(level_status, level_id) DO UPDATE SET
                  answer = excluded.answer,
                  updated_at = excluded.updated_at
                """,
                (normalized_category, normalized["id"], json_text(answers), now),
            )
    normalized["sourceCategory"] = normalized_category
    normalized["sourcePath"] = source_path(normalized_category, normalized["id"])
    return normalized


def next_level_id(difficulty: int, category: str = "stable") -> str:
    prefix = str(clamp_int(difficulty, 1, 5))
    normalized_category = normalize_category(category)
    is_temporary = normalized_category != "stable"
    categories = ("alpha", "removed") if is_temporary else ("stable",)
    placeholders = ",".join("?" for _ in categories)
    with connect() as connection:
        rows = connection.execute(
            f"""
            SELECT id FROM levels
            WHERE status IN ({placeholders}) AND difficulty = ?
            """,
            (*categories, int(prefix)),
        ).fetchall()
    used: set[int] = set()
    for row in rows:
        level_id = str(row["id"])
        if len(level_id) >= 4 and level_id[1:4].isdigit():
            used.add(int(level_id[1:4]))
    for number in range(1, 1000):
        if number not in used:
            return f"{prefix}{number:03d}{'-tmp' if is_temporary else ''}"
    raise RuntimeError("No bridger level ids left")


def normalize_level(level: LevelData) -> LevelData:
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
    level_id = str(level.get("id") or next_level_id(difficulty))
    return {
        "id": level_id,
        "name": str(level.get("name") or level_id or "数桥关卡"),
        "difficulty": difficulty,
        "gridType": "bridger",
        "width": width,
        "height": height,
        "islands": islands,
    }


def index_item_from_row(row: sqlite3.Row) -> LevelIndexItem:
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "difficulty": int(row["difficulty"] or 1),
        "sourcePath": source_path(row["status"], row["id"]),
        "sourceCategory": normalize_category(row["status"]),
    }


def level_from_row(row: sqlite3.Row) -> LevelData:
    payload = json_obj(row["payload"])
    level = {
        **payload,
        "id": str(row["id"]),
        "name": str(row["name"]),
        "difficulty": int(row["difficulty"] or 1),
        "gridType": row["grid_type"] or payload.get("gridType", "bridger"),
        "width": int(row["width"] or payload.get("width") or 1),
        "height": int(row["height"] or payload.get("height") or 1),
        "islands": json_list(payload.get("islands", [])),
        "sourcePath": source_path(row["status"], row["id"]),
        "sourceCategory": normalize_category(row["status"]),
    }
    return level


def storage_payload(level: LevelData) -> dict[str, Any]:
    payload = dict(level)
    payload.pop("sourcePath", None)
    payload.pop("sourceCategory", None)
    return payload


def split_source_path(value: str) -> tuple[str, str]:
    normalized = normalize_path(value)
    category, _, file_name = normalized.partition("/")
    if category not in CATEGORIES or not file_name.endswith(".json"):
        return "", ""
    return category, file_name[:-5]


def source_path(category: str, level_id: str) -> str:
    return f"{normalize_category(category)}/{level_id}.json"


def normalize_category(category: Any) -> str:
    value = str(category or "stable")
    return value if value in CATEGORIES else "stable"


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


def json_obj(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def row_value(row: sqlite3.Row, columns: set[str], key: str, fallback: Any = None) -> Any:
    return row[key] if key in columns else fallback


def nullable_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def clamp_int(value: Any, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = minimum
    return min(maximum, max(minimum, number))


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
