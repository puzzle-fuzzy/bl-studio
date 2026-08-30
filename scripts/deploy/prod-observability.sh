#!/usr/bin/env bash
# 在部署目标服务器上启停生产观测 profile。
# 本地 Docker Desktop 只负责构建镜像；生产 Compose 必须通过 SSH 运行在目标机。
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

COMPOSE="docker compose --env-file $REMOTE_DEPLOY/env/.env.prod --profile observability -f $REMOTE_DEPLOY/docker/compose.prod.yaml"
OBSERVABILITY_SERVICES="loki alloy grafana monitor"

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

smoke_observability() {
  # 观测服务没有把宿主机端口暴露到公网；从远端宿主机检查本地端口，
  # 同时确认四个 profile 服务都处于 running，避免只检查 Grafana 而漏掉采集链。
  ssh_cmd "
set -eu
command -v curl >/dev/null 2>&1 || { echo '远端缺少 curl，无法执行观测栈冒烟' >&2; exit 1; }
for attempt in \$(seq 1 24); do
  services_ok=1
  for service in $OBSERVABILITY_SERVICES; do
    if ! $COMPOSE ps --status running --services | grep -Fxq \"\$service\"; then
      services_ok=0
      break
    fi
  done

  loki_ok=1
  curl -fsS --max-time 10 http://127.0.0.1:3100/ready >/dev/null 2>&1 || loki_ok=0

  grafana_ok=1
  grafana_health=\"\$(curl -fsS --max-time 10 http://127.0.0.1:5300/api/health 2>/dev/null || true)\"
  printf '%s' \"\$grafana_health\" | grep -Fq '\"database\":\"ok\"' || grafana_ok=0

  if [ \"\$services_ok\" -eq 1 ] && [ \"\$loki_ok\" -eq 1 ] && [ \"\$grafana_ok\" -eq 1 ]; then
    echo '观测栈冒烟通过：loki/alloy/grafana/monitor running，Loki/Grafana healthy'
    exit 0
  fi
  sleep 5
done

echo '观测栈冒烟失败：服务未全部 running 或 Loki/Grafana health 未通过' >&2
$COMPOSE ps >&2
exit 1
"
}

case "${1:-up}" in
  up)
    # 配置文件通过 bind mount 同步；强制重建观测服务可确保文件/目录类型变更
    # （尤其是 loki.yaml、config.alloy）不会被旧容器挂载缓存掩盖。
    ssh_cmd "$COMPOSE pull $OBSERVABILITY_SERVICES && $COMPOSE up -d --no-build --pull never --force-recreate $OBSERVABILITY_SERVICES"
    smoke_observability
    ;;
  down)
    ssh_cmd "$COMPOSE stop"
    ;;
  ps|status)
    ssh_cmd "$COMPOSE ps"
    ;;
  smoke)
    smoke_observability
    ;;
  *)
    echo "用法：prod-observability.sh [up|down|ps|smoke]" >&2
    exit 2
    ;;
esac
