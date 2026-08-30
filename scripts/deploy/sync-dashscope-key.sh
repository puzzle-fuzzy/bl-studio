#!/usr/bin/env bash
# 把 dev .env 里的 DASHSCOPE_API_KEY（百炼 key）同步到生产并重启 api/worker 生效。
#
# 背景：dev 的 .env.dev 与生产 .env.prod 是两份独立文件；改 dev 的百炼 key 不会
# 自动到线上。本命令一条完成：取 dev key → 写入 .env.prod → rsync 到服务器 →
# 重启 api/worker。绝不打印 key 值。
#
# 用法：bun run prod:sync-dashscope-key
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_DEV="$REPO_ROOT/deploy/env/.env.dev"
ENV_PROD="$REPO_ROOT/deploy/env/.env.prod"

[[ -f "$ENV_DEV" ]] || { echo "缺少 $ENV_DEV" >&2; exit 1; }
[[ -f "$ENV_PROD" ]] || { echo "缺少 $ENV_PROD" >&2; exit 1; }

env_value() { awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print; exit }' "$2"; }

DEPLOY_HOST="$(env_value DEPLOY_HOST "$ENV_PROD")"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY "$ENV_PROD")"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR "$ENV_PROD")"
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

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

# 1) 取 dev 里的百炼 key（绝不打印值）
NEW_KEY="$(env_value DASHSCOPE_API_KEY "$ENV_DEV")"
[[ -n "$NEW_KEY" ]] || { echo "dev .env 里没有 DASHSCOPE_API_KEY" >&2; exit 1; }

# 2) 幂等写入 .env.prod（awk 重写，避免 sed 对特殊字符的转义问题）
awk -F= -v new="$NEW_KEY" '
  $1 == "DASHSCOPE_API_KEY" { print "DASHSCOPE_API_KEY=" new; next }
  { print }
' "$ENV_PROD" > /tmp/env-prod-sync && mv /tmp/env-prod-sync "$ENV_PROD"
grep -q '^DASHSCOPE_API_KEY=' "$ENV_PROD" || printf 'DASHSCOPE_API_KEY=%s\n' "$NEW_KEY" >> "$ENV_PROD"
chmod 600 "$ENV_PROD"

# 3) 同步到服务器
echo "==> 同步 .env.prod 到服务器"
ssh_cmd "mkdir -p $REMOTE_DEPLOY/env"
deploy_rsync "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$ENV_PROD" "$DEPLOY_HOST:$REMOTE_DEPLOY/env/"
ssh_cmd "chmod 600 $REMOTE_DEPLOY/env/.env.prod"

# 4) 重启 api/worker 应用新 key
echo "==> 重启 api/worker"
ssh_cmd "docker compose --env-file $REMOTE_DEPLOY/env/.env.prod -f $REMOTE_DEPLOY/docker/compose.prod.yaml up -d --force-recreate --no-deps api worker"

# 5) 校验（md5 一致 + 注入长度，不打印值）
LOCAL_MD5="$(md5 -q "$ENV_PROD")"
REMOTE_MD5="$(ssh_cmd "md5sum $REMOTE_DEPLOY/env/.env.prod | awk '{print \$1}'")"
[[ "$LOCAL_MD5" == "$REMOTE_MD5" ]] || { echo "校验失败：线上 .env.prod 与本地不一致" >&2; exit 1; }
echo "==> 完成：.env.prod 本地与线上一致，api/worker 已用新 key 重启"
