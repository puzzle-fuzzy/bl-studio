#!/usr/bin/env bash
# 生产状态一键汇总：容器状态 + 内存 + 磁盘 + api/worker 最近日志。
# 维护时第一件事先跑它，快速判断服务健康度。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_PROD="$REPO_ROOT/deploy/env/.env.prod"
[[ -f "$ENV_PROD" ]] || { echo "缺少 $ENV_PROD" >&2; exit 1; }

env_value() { awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print }' "$ENV_PROD" | tail -n 1; }
DEPLOY_HOST="$(env_value DEPLOY_HOST)"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY)"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR)"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/bailian-studio}"
REMOTE_DEPLOY="$DEPLOY_REMOTE_DIR/deploy"
[[ -n "$DEPLOY_HOST" ]] || { echo "缺少 DEPLOY_HOST" >&2; exit 1; }

source "$REPO_ROOT/scripts/deploy/resolve-deploy-ssh-key.sh"
DEPLOY_SSH_KEY="$(resolve_deploy_ssh_key "$DEPLOY_SSH_KEY")"
if [[ -n "$DEPLOY_SSH_KEY" && ! -f "$DEPLOY_SSH_KEY" ]]; then
  echo "DEPLOY_SSH_KEY 不存在或无法从当前 Bash 环境访问" >&2
  exit 1
fi
DEPLOY_SSH_KNOWN_HOSTS="$(resolve_deploy_ssh_known_hosts "$DEPLOY_SSH_KEY")"

COMPOSE="docker compose --env-file $REMOTE_DEPLOY/env/.env.prod -f $REMOTE_DEPLOY/docker/compose.prod.yaml"

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

ssh_cmd "$COMPOSE ps --format 'table {{.Name}}\t{{.Status}}'; echo '--- 内存 ---'; free -h | head -2; echo '--- 磁盘 ---'; df -h / | tail -1; echo '--- api 最近 3 条 ---'; $COMPOSE logs --tail 3 api 2>&1 | tail -3; echo '--- worker 最近 3 条 ---'; $COMPOSE logs --tail 3 worker 2>&1 | tail -3"
