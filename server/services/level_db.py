from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator

from server.config import get_settings
from server.paths import normalize_path

CATEGORIES = {"stable", "alpha", "removed"}
SCHEMA_VERSION = 2


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """打开数据库连接并自动处理事务提交或回滚。"""
    database_file = get_settings().sqlite_database_file
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
    """创建或升级数据库表结构。"""
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
          grid_type TEXT NOT NULL DEFAULT 'square',
          width INTEGER,
          height INTEGER,
          radius INTEGER,
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


def migrate_existing_levels_table(connection: sqlite3.Connection) -> None:
    """将旧版 levels 表迁移为当前结构。"""
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(levels)").fetchall()}
    required = {
        "id",
        "name",
        "status",
        "difficulty",
        "grid_type",
        "width",
        "height",
        "radius",
        "pairs",
        "removed_edges",
        "payload",
        "level_hash",
        "level_canonical",
        "updated_at",
    }
    if required.issubset(columns):
        return
    connection.execute("ALTER TABLE levels RENAME TO levels_legacy")
    connection.executescript(
        """
        CREATE TABLE levels (
          id TEXT NOT NULL,
          name TEXT,
          status TEXT NOT NULL DEFAULT 'stable',
          difficulty INTEGER NOT NULL DEFAULT 1,
          grid_type TEXT NOT NULL DEFAULT 'square',
          width INTEGER,
          height INTEGER,
          radius INTEGER,
          pairs JSON NOT NULL DEFAULT '[]',
          removed_edges JSON NOT NULL DEFAULT '[]',
          payload JSON NOT NULL DEFAULT '{}',
          level_hash TEXT,
          level_canonical TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (status, id)
        );
        DROP TABLE levels_legacy;
        """
    )


def migrate_existing_answers_table(connection: sqlite3.Connection) -> None:
    """将旧版 answers 表迁移为当前结构。"""
    rows = connection.execute("PRAGMA table_info(answers)").fetchall()
    columns = {row["name"] for row in rows}
    primary_key_columns = [row["name"] for row in sorted(rows, key=lambda item: item["pk"]) if row["pk"]]
    if (
        {"level_status", "level_id", "answer", "updated_at"}.issubset(columns)
        and "id" not in columns
        and primary_key_columns == ["level_status", "level_id"]
    ):
        return
    connection.execute("ALTER TABLE answers RENAME TO answers_legacy")
    connection.executescript(
        """
        CREATE TABLE answers (
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
        INSERT OR REPLACE INTO answers (level_status, level_id, answer, updated_at)
          SELECT level_status, level_id, answer, updated_at
          FROM answers_legacy
          WHERE level_status IS NOT NULL AND level_id IS NOT NULL;
        DROP TABLE answers_legacy;
        """
    )


def read_level_index() -> list[dict[str, Any]]:
    """读取用于列表展示的关卡索引。"""
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
    return [level_index_item_from_row(row) for row in rows]


def read_levels() -> list[dict[str, Any]]:
    """读取全部关卡完整记录。"""
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM levels
            ORDER BY
              CASE status WHEN 'stable' THEN 0 WHEN 'alpha' THEN 1 WHEN 'removed' THEN 2 ELSE 9 END,
              id
            """
        ).fetchall()
    return [level_from_row(row) for row in rows]


def read_level_by_id(level_id: str) -> dict[str, Any] | None:
    """按关卡 id 读取首个匹配记录。"""
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


def read_level_by_source_path(source_path: str) -> dict[str, Any] | None:
    """按 sourcePath 读取关卡。"""
    category, level_id = split_source_path(source_path)
    if not category or not level_id:
        return None
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM levels WHERE status = ? AND id = ?",
            (category, level_id),
        ).fetchone()
    return level_from_row(row) if row else None


def read_answers(category: str, level_id: str) -> list[Any]:
    """读取某个关卡的答案数组。"""
    with connect() as connection:
        row = connection.execute(
            "SELECT answer FROM answers WHERE level_status = ? AND level_id = ?",
            (category, level_id),
        ).fetchone()
    if not row:
        return []
    return json_list(row["answer"])


def write_level(level: dict[str, Any], category: str, answers: list[Any] | None = None) -> None:
    """写入或更新关卡及其答案。"""
    normalized_category = normalize_category(category)
    now = utc_now()
    payload = storage_payload(level)
    level_hash = level.get("levelHash")
    level_canonical = level.get("levelCanonical")
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO levels (
              id, name, status, difficulty, grid_type, width, height, radius,
              pairs, removed_edges, payload, level_hash, level_canonical, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(status, id) DO UPDATE SET
              name = excluded.name,
              difficulty = excluded.difficulty,
              grid_type = excluded.grid_type,
              width = excluded.width,
              height = excluded.height,
              radius = excluded.radius,
              pairs = excluded.pairs,
              removed_edges = excluded.removed_edges,
              payload = excluded.payload,
              level_hash = excluded.level_hash,
              level_canonical = excluded.level_canonical,
              updated_at = excluded.updated_at
            """,
            (
                str(level["id"]),
                level.get("name"),
                normalized_category,
                int(level.get("difficulty", 1)),
                str(level.get("gridType") or "square"),
                nullable_int(level.get("width")),
                nullable_int(level.get("height")),
                nullable_int(level.get("radius")),
                json_text(level.get("pairs", [])),
                json_text(level.get("removedEdges", [])),
                json_text(payload),
                level_hash,
                level_canonical,
                now,
            ),
        )
        if answers is not None:
            write_answers_with_connection(connection, normalized_category, str(level["id"]), answers, now)


def write_answers(category: str, level_id: str, answers: list[Any]) -> None:
    """单独写入某个关卡的答案。"""
    with connect() as connection:
        write_answers_with_connection(connection, normalize_category(category), level_id, answers, utc_now())


def move_level(source_category: str, source_id: str, target_category: str, target_level: dict[str, Any]) -> None:
    """把关卡从一个分类移动到另一个分类。"""
    source_category = normalize_category(source_category)
    target_category = normalize_category(target_category)
    answers = read_answers(source_category, source_id)
    with connect() as connection:
        connection.execute(
            "DELETE FROM levels WHERE status = ? AND id = ?",
            (target_category, str(target_level["id"])),
        )
        connection.execute(
            "DELETE FROM levels WHERE status = ? AND id = ?",
            (source_category, source_id),
        )
    write_level(target_level, target_category, answers)


def delete_level(category: str, level_id: str) -> None:
    """删除指定分类下的关卡。"""
    with connect() as connection:
        connection.execute(
            "DELETE FROM levels WHERE status = ? AND id = ?",
            (normalize_category(category), level_id),
        )


def level_exists(category: str, level_id: str) -> bool:
    """判断关卡是否存在。"""
    with connect() as connection:
        row = connection.execute(
            "SELECT 1 FROM levels WHERE status = ? AND id = ?",
            (normalize_category(category), level_id),
        ).fetchone()
    return bool(row)


def find_duplicate_level_ids(level_hash: str, exclude_ids: set[str] | None = None) -> list[str]:
    """查找具有相同哈希的关卡 id。"""
    exclude_ids = exclude_ids or set()
    with connect() as connection:
        rows = connection.execute(
            "SELECT id FROM levels WHERE level_hash = ? ORDER BY id",
            (level_hash,),
        ).fetchall()
    return [str(row["id"]) for row in rows if str(row["id"]) not in exclude_ids]


def get_next_level_id(difficulty: int, category: str) -> str:
    """生成下一个可用的关卡 id。"""
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
            (*categories, difficulty),
        ).fetchall()
    used: set[int] = set()
    for row in rows:
        level_id = str(row["id"])
        if len(level_id) < 4 or not level_id[1:4].isdigit():
            continue
        used.add(int(level_id[1:4]))
    for number in range(1, 1000):
        if number not in used:
            return f"{difficulty}{number:03d}{'-tmp' if is_temporary else ''}"
    raise RuntimeError(f"No level ids left for difficulty {difficulty}")


def import_from_files(levels_dir: Path, answers_dir: Path, *, replace: bool = False) -> dict[str, int]:
    """从文件系统导入关卡和答案到数据库。"""
    counts = {"levels": 0, "answers": 0}
    with connect() as connection:
        if replace:
            connection.execute("DELETE FROM answers")
            connection.execute("DELETE FROM levels")
    for level_path in sorted(levels_dir.glob("*/*.json")):
        category = normalize_category(level_path.parent.name)
        level = json.loads(level_path.read_text(encoding="utf-8"))
        level["id"] = level_path.stem
        answer_path = answers_dir / category / level_path.name
        answers: list[Any] = []
        if answer_path.is_file():
            answer_payload = json.loads(answer_path.read_text(encoding="utf-8"))
            answers = answer_payload.get("answers", []) if isinstance(answer_payload, dict) else answer_payload
            counts["answers"] += 1
        write_level(level, category, answers if isinstance(answers, list) else [])
        counts["levels"] += 1
    return counts


def sync_hashes(create_level_hash: Any) -> None:
    """重新计算并回写所有关卡哈希。"""
    levels = read_levels()
    with connect() as connection:
        for level in levels:
            level_hash = create_level_hash(level)
            connection.execute(
                """
                UPDATE levels
                SET level_hash = ?, level_canonical = ?, updated_at = ?
                WHERE status = ? AND id = ?
                """,
                (
                    level_hash["hash"],
                    level_hash["canonical"],
                    utc_now(),
                    level["sourceCategory"],
                    level["id"],
                ),
            )


def write_answers_with_connection(
    connection: sqlite3.Connection,
    category: str,
    level_id: str,
    answers: list[Any],
    updated_at: str,
) -> None:
    """在已有数据库连接里写入答案。"""
    connection.execute(
        """
        INSERT INTO answers (level_status, level_id, answer, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(level_status, level_id) DO UPDATE SET
          answer = excluded.answer,
          updated_at = excluded.updated_at
        """,
        (category, level_id, json_text(answers), updated_at),
    )


def level_from_row(row: sqlite3.Row | None) -> dict[str, Any]:
    """把数据库行转换为关卡字典。"""
    if row is None:
        return {}
    payload = json_obj(row["payload"])
    level = {
        **payload,
        "id": str(row["id"]),
        "name": row["name"],
        "difficulty": int(row["difficulty"] or 1),
        "gridType": row["grid_type"] or payload.get("gridType", "square"),
        "pairs": json_list(row["pairs"]),
        "removedEdges": json_list(row["removed_edges"]),
        "sourcePath": source_path(row["status"], row["id"]),
        "sourceCategory": normalize_category(row["status"]),
    }
    if row["width"] is not None:
        level["width"] = int(row["width"])
    if row["height"] is not None:
        level["height"] = int(row["height"])
    if row["radius"] is not None:
        level["radius"] = int(row["radius"])
    return level


def level_index_item_from_row(row: sqlite3.Row) -> dict[str, Any]:
    """把数据库行转换为关卡索引项。"""
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "difficulty": int(row["difficulty"] or 1),
        "sourcePath": source_path(row["status"], row["id"]),
        "sourceCategory": normalize_category(row["status"]),
    }


def storage_payload(level: dict[str, Any]) -> dict[str, Any]:
    """移除不应该落库的运行时字段。"""
    payload = dict(level)
    for key in (
        "sourcePath",
        "sourceCategory",
        "answers",
        "levelHash",
        "levelCanonical",
    ):
        payload.pop(key, None)
    return payload


def split_source_path(value: str) -> tuple[str, str]:
    """把 sourcePath 拆成分类和文件名。"""
    normalized = normalize_path(value)
    category, _, file_name = normalized.partition("/")
    if category not in CATEGORIES or not file_name.endswith(".json"):
        return "", ""
    return category, file_name[:-5]


def source_path(category: str, level_id: str) -> str:
    """拼出标准 sourcePath。"""
    return f"{normalize_category(category)}/{level_id}.json"


def normalize_category(category: Any) -> str:
    """把分类规范为稳定值。"""
    value = str(category or "stable")
    return value if value in CATEGORIES else "stable"


def json_text(value: Any) -> str:
    """把值序列化为紧凑 JSON 文本。"""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_list(value: Any) -> list[Any]:
    """把任意 JSON 内容读取为列表。"""
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def json_obj(value: Any) -> dict[str, Any]:
    """把任意 JSON 内容读取为对象。"""
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def nullable_int(value: Any) -> int | None:
    """把可空值转换成整数。"""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def utc_now() -> str:
    """返回当前 UTC 时间的 ISO 字符串。"""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
