#!/usr/bin/env bash
# web-only 快速发版：只重建+传输 web 镜像（约 20MB），只重建 web 容器。
# 只改前端时用它，避免整包 deploy:prod 重传 1.9GB runtime；api/worker 不受影响。
#
# 注意：只把 web 切到新 SHA，BAILIAN_STUDIO_RELEASE_TAG 维持旧值（api/worker 继续跑旧镜像）。
# 验证：curl 线上首页取 /assets/index-*.js，与本地 dist 同名字节数一致即生效。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
trap 'rm -f "$REPO_ROOT"/web-*.tar' EXIT

ENV_INFRA="$REPO_ROOT/infra/env/.env.prod-infra"
ENV_APP="$REPO_ROOT/infra/env/.env.production"
[[ -f "$ENV_INFRA" ]] || { echo "缺少 $ENV_INFRA" >&2; exit 1; }
[[ -f "$ENV_APP" ]] || { echo "缺少 $ENV_APP" >&2; exit 1; }

env_value() { local file="${2:-$ENV_INFRA}"; awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print }' "$file" | tail -n 1; }
DEPLOY_HOST="$(env_value DEPLOY_HOST)"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY)"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR)"
SITE_DOMAIN="$(env_value SITE_DOMAIN)"
LEGAL_ENTITY="$(env_value VITE_LEGAL_ENTITY "$ENV_APP")"
LEGAL_CONTACT_EMAIL="$(env_value VITE_LEGAL_CONTACT_EMAIL "$ENV_APP")"
LEGAL_EFFECTIVE_DATE="$(env_value VITE_LEGAL_EFFECTIVE_DATE "$ENV_APP")"
DEPLOY_PLATFORM="$(env_value DEPLOY_PLATFORM)"
[[ -n "$DEPLOY_HOST" ]] || { echo "缺少 DEPLOY_HOST" >&2; exit 1; }
[[ -n "$SITE_DOMAIN" ]] || { echo "缺少 SITE_DOMAIN" >&2; exit 1; }
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/bailian-studio}"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"
source "$REPO_ROOT/infra/scripts/resolve-deploy-ssh-key.sh"
DEPLOY_SSH_KEY="$(resolve_deploy_ssh_key "$DEPLOY_SSH_KEY")"
if [[ -n "$DEPLOY_SSH_KEY" && ! -f "$DEPLOY_SSH_KEY" ]]; then
  echo "DEPLOY_SSH_KEY 不存在或无法从当前 Bash 环境访问" >&2
  exit 1
fi
DEPLOY_SSH_KNOWN_HOSTS="$(resolve_deploy_ssh_known_hosts "$DEPLOY_SSH_KEY")"
SERVER_HOST="${DEPLOY_HOST##*@}"
SSH_RESOLVED_HOST="$(ssh -G "$DEPLOY_HOST" 2>/dev/null | awk '$1=="hostname" {print $2; exit}' || true)"
SERVER_HOST="${SSH_RESOLVED_HOST:-$SERVER_HOST}"

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

git diff --quiet && git diff --cached --quiet || { echo "工作区不干净，请先提交" >&2; exit 1; }
SHA="$(git rev-parse HEAD)"

echo "==> 构建 web 镜像（${DEPLOY_PLATFORM}, ${SHA:0:12}）"
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target web \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  --build-arg VITE_API_ORIGIN= \
  --build-arg VITE_WEB_ORIGIN="https://${SITE_DOMAIN}" \
  --build-arg VITE_LEGAL_ENTITY="$LEGAL_ENTITY" \
  --build-arg VITE_LEGAL_CONTACT_EMAIL="$LEGAL_CONTACT_EMAIL" \
  --build-arg VITE_LEGAL_EFFECTIVE_DATE="$LEGAL_EFFECTIVE_DATE" \
  -t "bailian-studio-web:$SHA" .
EXPECTED_INDEX_ASSET="$(docker run --rm --entrypoint sh "bailian-studio-web:$SHA" -c "grep -oE '/assets/index-[A-Za-z0-9_-]+\\.js' /usr/share/nginx/html/index.html | head -n 1")"
[[ -n "$EXPECTED_INDEX_ASSET" ]] || { echo "无法从 web 镜像读取 index bundle" >&2; exit 1; }

echo "==> 传输 web 镜像（约 20MB）"
docker save -o "web-$SHA.tar" "bailian-studio-web:$SHA"
deploy_rsync "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "web-$SHA.tar" "$DEPLOY_HOST:$DEPLOY_REMOTE_DIR/"

echo "==> 服务器 load + 重建 web 容器"
ssh_cmd "docker load -i $DEPLOY_REMOTE_DIR/web-$SHA.tar && rm -f $DEPLOY_REMOTE_DIR/web-$SHA.tar && BAILIAN_STUDIO_RELEASE_TAG=$SHA docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra -f $REMOTE_INFRA/docker/docker-compose.prod.yml up -d --no-deps web"
bash "$REPO_ROOT/infra/scripts/verify-web-release.sh" "$EXPECTED_INDEX_ASSET" "$SITE_DOMAIN" "$SERVER_HOST"

echo "==> web 已更新（tag ${SHA:0:12}）"
