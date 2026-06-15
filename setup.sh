#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBUI_DIR="$ROOT_DIR/webui"
UV_BIN="${UV_BIN:-}"
INSTALL_SYSTEMD="${INSTALL_SYSTEMD:-0}"
RESTART_SERVICE="${RESTART_SERVICE:-0}"
SERVICE_NAME="${SERVICE_NAME:-linker}"
LOG_DIR="$ROOT_DIR/.setup-logs"

usage() {
  cat <<'EOF'
用法: ./setup.sh [选项]

选项:
  --install-systemd   安装并启用 systemd 服务
  --restart           构建、同步后重启 systemd 服务
  --service <name>    systemd 服务名，默认 linker
  -h, --help          显示帮助

环境变量:
  UV_BIN=/path/to/uv
  SERVICE_NAME=linker
  INSTALL_SYSTEMD=1
  RESTART_SERVICE=1
EOF
}

while (($# > 0)); do
  case "$1" in
    --install-systemd)
      INSTALL_SYSTEMD=1
      shift
      ;;
    --restart)
      RESTART_SERVICE=1
      shift
      ;;
    --service|-ser)
      SERVICE_NAME="${2:-}"
      if [[ -z "$SERVICE_NAME" ]]; then
        echo "--service 需要服务名" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知选项: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"

run_quiet() {
  local label="$1"
  local log_file="$2"
  shift 2
  if ! "$@" >"$log_file" 2>&1; then
    echo "${label}失败，日志: $log_file" >&2
    tail -n 40 "$log_file" >&2 || true
    exit 1
  fi
}

if [[ -z "$UV_BIN" ]]; then
  if command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
  elif [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_BIN="$HOME/.local/bin/uv"
  else
    echo "找不到 uv，请先安装: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
  fi
fi

echo "1/4 安装前端依赖"
cd "$WEBUI_DIR"
run_quiet "安装前端依赖" "$LOG_DIR/npm-ci.log" npm ci --silent --no-fund

echo "2/4 构建前端"
run_quiet "构建前端" "$LOG_DIR/webui-build.log" npm run build --silent
cd "$ROOT_DIR"

echo "3/4 同步后端依赖"
run_quiet "同步后端依赖" "$LOG_DIR/uv-sync.log" "$UV_BIN" sync --frozen --quiet

echo "4/4 同步 sqlite 结构和关卡哈希"
run_quiet "同步 sqlite 结构和关卡哈希" "$LOG_DIR/rebuild-level-indexes.log" "$UV_BIN" run python server/scripts/rebuild-level-indexes.py

if [[ "$INSTALL_SYSTEMD" == "1" ]]; then
  echo "安装 systemd 服务: $SERVICE_NAME"
  UV_BIN="$UV_BIN" SERVICE_NAME="$SERVICE_NAME" bash "$ROOT_DIR/deploy/install-systemd.sh"
fi

if [[ "$RESTART_SERVICE" == "1" ]]; then
  if ! systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    echo "找不到 systemd 服务: ${SERVICE_NAME}.service" >&2
    echo "请先安装: ./setup.sh --install-systemd" >&2
    exit 1
  fi
  echo "重启 systemd 服务: $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl --no-pager --full status "$SERVICE_NAME"
fi

echo "完成"
