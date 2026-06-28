#!/usr/bin/env python
from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[4]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server.config import get_settings
from server.games.bridger.services import refresh_level_index


def main() -> None:
    settings = get_settings()
    refresh_level_index()
    print(f"Synced sqlite level schema: {settings.bridger_sqlite_database_file}")


if __name__ == "__main__":
    main()
