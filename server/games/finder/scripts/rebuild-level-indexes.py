#!/usr/bin/env python
from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[4]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server.config import get_settings
from server.games.finder.services import refresh_all_level_indexes


def main() -> None:
    settings = get_settings()
    refresh_all_level_indexes()
    if settings.storage_method == "sqlite":
        print(f"Synced sqlite level hashes: {settings.finder_sqlite_database_file}")
    else:
        print(f"Rebuilt level index: {settings.finder_levels_index_file}")
        print(f"Rebuilt level hash: {settings.finder_levels_hash_file}")


if __name__ == "__main__":
    main()
