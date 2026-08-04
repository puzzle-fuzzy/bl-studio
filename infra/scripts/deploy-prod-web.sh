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
[[ -f "$ENV_INFRA" ]] || { echo "缺少 $ENV_INFRA" >&2; exit 1; }

env_value() { awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print }' "$ENV_INFRA" | tail -n 1; }
DEPLOY_HOST="$(env_value DEPLOY_HOST)"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY)"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR)"
SITE_DOMAIN="$(env_value SITE_DOMAIN)"
DEPLOY_PLATFORM="$(env_value DEPLOY_PLATFORM)"
[[ -n "$DEPLOY_HOST" ]] || { echo "缺少 DEPLOY_HOST" >&2; exit 1; }
[[ -n "$SITE_DOMAIN" ]] || { echo "缺少 SITE_DOMAIN" >&2; exit 1; }
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/bailian-studio}"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"

ssh_cmd() {
  if [[ -n "$DEPLOY_SSH_KEY" ]]; then ssh -i "$DEPLOY_SSH_KEY" "$DEPLOY_HOST" "$1"
  else ssh "$DEPLOY_HOST" "$1"; fi
}

git diff --quiet && git diff --cached --quiet || { echo "工作区不干净，请先提交" >&2; exit 1; }
SHA="$(git rev-parse HEAD)"

echo "==> 构建 web 镜像（${DEPLOY_PLATFORM}, ${SHA:0:12}）"
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target web \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  --build-arg VITE_API_ORIGIN= \
  --build-arg VITE_WEB_ORIGIN="https://${SITE_DOMAIN}" \
  -t "bailian-studio-web:$SHA" .

echo "==> 传输 web 镜像（约 20MB）"
docker save -o "web-$SHA.tar" "bailian-studio-web:$SHA"
rsync -az "web-$SHA.tar" "$DEPLOY_HOST:$DEPLOY_REMOTE_DIR/"

echo "==> 服务器 load + 重建 web 容器"
ssh_cmd "docker load -i $DEPLOY_REMOTE_DIR/web-$SHA.tar && rm -f $DEPLOY_REMOTE_DIR/web-$SHA.tar && BAILIAN_STUDIO_RELEASE_TAG=$SHA docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra -f $REMOTE_INFRA/docker/docker-compose.prod.yml up -d --no-deps web"

echo "==> web 已更新（tag ${SHA:0:12}）"
