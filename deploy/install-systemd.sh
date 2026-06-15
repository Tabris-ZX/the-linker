#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_FILE="$ROOT_DIR/deploy/linker.service"
SERVICE_NAME="${SERVICE_NAME:-linker}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn)}"
UV_BIN="${UV_BIN:-}"

if [[ -z "$UV_BIN" ]]; then
  if command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
  elif [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_BIN="$HOME/.local/bin/uv"
  else
    echo "找不到 uv。请设置 UV_BIN=/path/to/uv，或先安装 uv。" >&2
    exit 1
  fi
fi

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "缺少 service 模板: $TEMPLATE_FILE" >&2
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

sed \
  -e "s#__USER__#${SERVICE_USER}#g" \
  -e "s#__GROUP__#${SERVICE_GROUP}#g" \
  -e "s#__ROOT_DIR__#${ROOT_DIR}#g" \
  -e "s#__UV_BIN__#${UV_BIN}#g" \
  "$TEMPLATE_FILE" > "$tmp_file"

sudo install -m 0644 "$tmp_file" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo "已安装: $SERVICE_FILE"
echo "启动服务: sudo systemctl start $SERVICE_NAME"
