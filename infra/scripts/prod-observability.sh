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

source "$REPO_ROOT/infra/scripts/resolve-deploy-ssh-key.sh"
DEPLOY_SSH_KEY="$(resolve_deploy_ssh_key "$DEPLOY_SSH_KEY")"
if [[ -n "$DEPLOY_SSH_KEY" && ! -f "$DEPLOY_SSH_KEY" ]]; then
  echo "DEPLOY_SSH_KEY 不存在或无法从当前 Bash 环境访问" >&2
  exit 1
fi
DEPLOY_SSH_KNOWN_HOSTS="$(resolve_deploy_ssh_known_hosts "$DEPLOY_SSH_KEY")"

COMPOSE="docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra --profile observability -f $REMOTE_INFRA/docker/docker-compose.prod.yml"
OBSERVABILITY_SERVICES="loki alloy grafana monitor"

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

case "${1:-up}" in
  up)
    # 配置文件通过 bind mount 同步；强制重建观测服务可确保文件/目录类型变更
    # （尤其是 loki.yaml、config.alloy）不会被旧容器挂载缓存掩盖。
    ssh_cmd "$COMPOSE pull $OBSERVABILITY_SERVICES && $COMPOSE up -d --no-build --pull never --force-recreate $OBSERVABILITY_SERVICES"
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
