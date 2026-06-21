#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "config.yaml"
API_PATHS = (
    "/api/linker/levels/index",
    "/api/bridger/levels/index",
    "/api/bridger/levels/bridge-001",
)


def main() -> int:
    port = read_backend_port()
    base_url = f"http://127.0.0.1:{port}"
    failed = False
    for path in API_PATHS:
        url = base_url + path
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                body = response.read().decode("utf-8")
                json.loads(body)
                print(f"OK {response.status} {url}")
        except urllib.error.HTTPError as error:
            failed = True
            print(f"FAIL {error.code} {url}: {error.read().decode('utf-8', 'ignore')[:200]}")
        except Exception as error:
            failed = True
            print(f"FAIL {url}: {error}")
    return 1 if failed else 0


def read_backend_port() -> int:
    try:
        config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except OSError:
        config = {}
    server = config.get("server") if isinstance(config, dict) else {}
    try:
        return int((server or {}).get("backendPort") or 5174)
    except (TypeError, ValueError):
        return 5174


if __name__ == "__main__":
    sys.exit(main())
