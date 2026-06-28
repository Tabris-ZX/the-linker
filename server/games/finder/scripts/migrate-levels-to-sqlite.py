#!/usr/bin/env python
from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[4]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server.config import get_settings
from server.games.finder import repositories as level_db
from server.games.finder.level_hash import create_level_hash


def main() -> None:
    settings = get_settings()
    counts = level_db.import_from_files(settings.finder_levels_dir, settings.finder_answers_dir, replace=True)
    level_db.sync_hashes(create_level_hash)
    print(f"Imported levels: {counts['levels']}")
    print(f"Imported answers: {counts['answers']}")
    print(f"SQLite database: {settings.finder_sqlite_database_file}")


if __name__ == "__main__":
    main()
