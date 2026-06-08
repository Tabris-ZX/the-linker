#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBUI_DIR="$ROOT_DIR/webui"
UV_BIN="${UV_BIN:-$HOME/.local/bin/uv}"
PUBLIC_DIR="${PUBLIC_DIR:-/var/www/linker}"

cd "$ROOT_DIR"

if [[ ! -x "$UV_BIN" ]]; then
  if command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
  else
    echo "uv not found. Install it first: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
  fi
fi

BACKEND_PORT="$("$UV_BIN" run python - <<'PY'
from server.config import get_settings

print(get_settings().backend_port)
PY
)"

echo "1/5 webui"
cd "$WEBUI_DIR"
npm install
npm run build
cd "$ROOT_DIR"

echo "2/5 publish"
if [[ ! -d "$PUBLIC_DIR" || ! -w "$PUBLIC_DIR" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p "$PUBLIC_DIR"
    sudo chown -R "$USER:$USER" "$PUBLIC_DIR"
  else
    echo "$PUBLIC_DIR is not writable and sudo is unavailable" >&2
    exit 1
  fi
fi
find "$PUBLIC_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$WEBUI_DIR/dist/." "$PUBLIC_DIR/"

echo "3/5 deps"
"$UV_BIN" sync

echo "4/5 port"
mapfile -t PORT_PIDS < <(ss -ltnp "sport = :$BACKEND_PORT" 2>/dev/null \
  | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
  | sort -u)

if ((${#PORT_PIDS[@]} > 0)); then
  kill "${PORT_PIDS[@]}" 2>/dev/null || true
  sleep 1

  mapfile -t PORT_PIDS < <(ss -ltnp "sport = :$BACKEND_PORT" 2>/dev/null \
    | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
    | sort -u)
  if ((${#PORT_PIDS[@]} > 0)); then
    kill -9 "${PORT_PIDS[@]}" 2>/dev/null || true
    sleep 1
  fi
fi

echo "5/5 start :$BACKEND_PORT"
exec "$UV_BIN" run python -m server.main
