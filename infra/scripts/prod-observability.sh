#!/usr/bin/env bash
# 在部署目标服务器上启停生产观测 profile。
# 本地 Docker Desktop 只负责构建镜像；生产 Compose 必须通过 SSH 运行在目标机。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_INFRA="$REPO_ROOT/infra/env/.env.prod-infra"
[[ -f "$ENV_INFRA" ]] || { echo "缺少 $ENV_INFRA" >&2; exit 1; }

env_value() { awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print }' "$ENV_INFRA" | tail -n 1; }
DEPLOY_HOST="$(env_value DEPLOY_HOST)"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY)"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR)"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/bailian-studio}"
REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"
[[ -n "$DEPLOY_HOST" ]] || { echo "缺少 DEPLOY_HOST" >&2; exit 1; }

COMPOSE="docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra --profile observability -f $REMOTE_INFRA/docker/docker-compose.prod.yml"

ssh_cmd() {
  if [[ -n "$DEPLOY_SSH_KEY" ]]; then ssh -i "$DEPLOY_SSH_KEY" "$DEPLOY_HOST" "$1"
  else ssh "$DEPLOY_HOST" "$1"; fi
}

case "${1:-up}" in
  up)
    ssh_cmd "$COMPOSE pull loki alloy grafana monitor && $COMPOSE up -d --no-build --pull never"
    ;;
  down)
    ssh_cmd "$COMPOSE stop"
    ;;
  ps|status)
    ssh_cmd "$COMPOSE ps"
    ;;
  *)
    echo "用法：prod-observability.sh [up|down|ps]" >&2
    exit 2
    ;;
esac
