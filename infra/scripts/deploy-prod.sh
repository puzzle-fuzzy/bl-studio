#!/usr/bin/env bash
# 自包含生产部署脚本（单机 Docker Compose，不需要镜像仓库）。
#
# 流程：预检 → 本机构镜像(commit SHA tag) → docker save → rsync 到服务器 →
# docker load → 拉基础镜像 → 迁移 → 滚动 up → 内网/公网冒烟。
#
# 前提：
#   - 本地与服务器都安装 docker + docker compose（v2）；本地有 rsync。
#   - 服务器已按 docs/03-ops.md「首次初始化」准备（SSH 可达、域名 DNS 指向服务器）。
#   - infra/env/.env.production 与 infra/env/.env.prod-infra 已填真实值（gitignored）。
#   - 部署前请确保 `pnpm run verify` 全绿。
#
# 安全：本脚本绝不在 stdout 打印任何凭据/环境变量值，只打印状态信息。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# 无论成功或失败，退出时清理镜像导出 tar，避免遗留大文件污染工作区
# （预检要求干净工作区，遗留 tar 会让下次部署的 GIT_WORKTREE 检查失败）。
trap 'rm -f "$REPO_ROOT"/images-*.tar' EXIT

ENV_APP="$REPO_ROOT/infra/env/.env.production"
ENV_INFRA="$REPO_ROOT/infra/env/.env.prod-infra"

fail() { echo "部署失败：$*" >&2; exit 1; }

# 从 dotenv 文件安全地读取单个键的值（只取首个 = 后的内容，不做求值，
# 避免值中的 $/空格被 shell 展开）。
env_value() {
  local key="$1" file="$2"
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/,""); print }' "$file" | tail -n 1
}

# ── 预检 1：本地环境文件存在 ──────────────────────────────────────
[[ -f "$ENV_APP" ]] || fail "缺少 ${ENV_APP}（复制 .env.production.example 后填写）"
[[ -f "$ENV_INFRA" ]] || fail "缺少 ${ENV_INFRA}（复制 .env.prod-infra.example 后填写）"

# ── 预检 2：干净工作区 + commit SHA ──────────────────────────────
git diff --quiet && git diff --cached --quiet || fail "工作区有未提交改动；生产镜像只能从干净工作区构建"
SHA="$(git rev-parse HEAD)"

# 把当前 SHA 幂等写入两个 env 文件的 BAILIAN_STUDIO_RELEASE_TAG 行。
inject_release_tag() {
  local file="$1"
  if grep -q '^BAILIAN_STUDIO_RELEASE_TAG=' "$file"; then
    sed -i.bak "s/^BAILIAN_STUDIO_RELEASE_TAG=.*/BAILIAN_STUDIO_RELEASE_TAG=$SHA/" "$file"
    rm -f "$file.bak"
  else
    printf 'BAILIAN_STUDIO_RELEASE_TAG=%s\n' "$SHA" >> "$file"
  fi
}
inject_release_tag "$ENV_APP"
inject_release_tag "$ENV_INFRA"

# ── 预检 3：生产预检（不联网、不打印值）──────────────────────────
pnpm exec dotenv -e "$ENV_APP" -- tsx infra/scripts/check-production-env.ts \
  || fail "check:production-env 未通过"
pnpm exec dotenv -e "$ENV_INFRA" -- tsx infra/scripts/check-production-env.ts infra \
  || fail "check:production-env infra 未通过"

# ── 读取部署参数（仅读取，不打印值）──────────────────────────────
DEPLOY_HOST="$(env_value DEPLOY_HOST "$ENV_INFRA")"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR "$ENV_INFRA")"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY "$ENV_INFRA")"
SITE_DOMAIN="$(env_value SITE_DOMAIN "$ENV_INFRA")"
# 目标服务器 CPU 架构。本机（Apple Silicon）与服务器（x86_64）架构不同时，
# 必须显式指定服务器架构跨平台构建，否则产出的 arm64 镜像无法在 x64 上运行。
# 若本机与服务器同为 x86_64，可在 .env.prod-infra 置空走默认 linux/amd64。
DEPLOY_PLATFORM="$(env_value DEPLOY_PLATFORM "$ENV_INFRA")"
[[ -n "$DEPLOY_HOST" ]] || fail "缺少 DEPLOY_HOST"
[[ -n "$DEPLOY_REMOTE_DIR" ]] || fail "缺少 DEPLOY_REMOTE_DIR"
[[ -n "$SITE_DOMAIN" ]] || fail "缺少 SITE_DOMAIN"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"

# 不用数组（macOS bash 3.2 下 set -u + 空数组展开会误报 unbound variable）。
ssh_cmd() {
  if [[ -n "$DEPLOY_SSH_KEY" ]]; then
    ssh -i "$DEPLOY_SSH_KEY" "$DEPLOY_HOST" "$1"
  else
    ssh "$DEPLOY_HOST" "$1"
  fi
}

echo "==> 部署目标：${DEPLOY_HOST}（镜像 tag: ${SHA:0:12}）"

# ── 本机构镜像（SHA tag，不可变）─────────────────────────────────
echo "==> 构建 runtime / web 镜像（平台 ${DEPLOY_PLATFORM}）"
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target runtime \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  -t "bailian-studio-runtime:$SHA" .
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target web \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  --build-arg VITE_API_ORIGIN= \
  --build-arg VITE_WEB_ORIGIN="https://$SITE_DOMAIN" \
  -t "bailian-studio-web:$SHA" .

# ── docker save → rsync 到服务器 ─────────────────────────────────
echo "==> 导出并传输镜像与配置"
docker save -o "images-$SHA.tar" "bailian-studio-runtime:$SHA" "bailian-studio-web:$SHA"

REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"
ssh_cmd "mkdir -p $REMOTE_INFRA/docker $REMOTE_INFRA/env $REMOTE_INFRA/loki $REMOTE_INFRA/alloy $REMOTE_INFRA/grafana $REMOTE_INFRA/nginx $REMOTE_INFRA/scripts"

rsync -az "images-$SHA.tar" "$DEPLOY_HOST:$DEPLOY_REMOTE_DIR/"
rsync -az infra/docker/docker-compose.prod.yml "$DEPLOY_HOST:$REMOTE_INFRA/docker/"
rsync -az infra/loki/ infra/alloy/ infra/grafana/ "$DEPLOY_HOST:$REMOTE_INFRA/"
# 宿主机 nginx 边缘：容器内 nginx 配置（烘焙进镜像）+ 两个站点模板 + 边缘接入脚本。
rsync -az infra/nginx/ "$DEPLOY_HOST:$REMOTE_INFRA/nginx/"
rsync -az infra/scripts/backup-postgres.sh infra/scripts/setup-host-edge.sh "$DEPLOY_HOST:$REMOTE_INFRA/scripts/"
rsync -az "$ENV_APP" "$ENV_INFRA" "$DEPLOY_HOST:$REMOTE_INFRA/env/"

# 服务器侧收紧 env 文件权限（含真实凭据）。
ssh_cmd "chmod 600 $REMOTE_INFRA/env/.env.production $REMOTE_INFRA/env/.env.prod-infra && chmod +x $REMOTE_INFRA/scripts/backup-postgres.sh"

# ── 服务器：docker load + 拉基础镜像 + 迁移 + 滚动 up ────────────
echo "==> 服务器 docker load"
ssh_cmd "docker load -i $DEPLOY_REMOTE_DIR/images-$SHA.tar"

COMPOSE="docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra -f $REMOTE_INFRA/docker/docker-compose.prod.yml"

echo "==> 拉取核心基础镜像（幂等；观测栈启用时另行 pull）"
ssh_cmd "$COMPOSE pull postgres >/dev/null"

echo "==> 执行数据库迁移"
ssh_cmd "$COMPOSE run --rm migrate"

echo "==> 滚动启动核心栈"
ssh_cmd "$COMPOSE up -d --no-build --pull never"

echo "==> 接入宿主机 nginx 边缘（证书 + conf.d，幂等）"
ssh_cmd "bash $REMOTE_INFRA/scripts/setup-host-edge.sh $REMOTE_INFRA"

# ── 冒烟 ─────────────────────────────────────────────────────────
echo "==> 等待 api 容器健康（最多 ~2.5 分钟）"
healthy=""
for _ in $(seq 1 30); do
  # 用 compose ps 解析容器状态（名字带 -1 后缀，不能硬编码）。
  status="$(ssh_cmd "$COMPOSE ps api --format '{{.Status}}' 2>/dev/null || echo starting")"
  if [[ "$status" == *"healthy"* ]]; then healthy=1; break; fi
  sleep 5
done
[[ -n "$healthy" ]] || fail "api 未在预期时间内变为 healthy"

echo "==> 公网冒烟（给 Let's Encrypt 首次签发留时间，最多 ~2 分钟）"
smoke_ok=""
for _ in $(seq 1 24); do
  if curl -fsS --max-time 10 "https://$SITE_DOMAIN/api/health/ready" >/dev/null 2>&1; then
    smoke_ok=1
    break
  fi
  sleep 5
done
[[ -n "$smoke_ok" ]] || fail "公网冒烟未通过（检查 DNS / 80/443 开放 / 宿主机 nginx 日志）"

# ── 清理 ─────────────────────────────────────────────────────────
rm -f "images-$SHA.tar"
ssh_cmd "rm -f $DEPLOY_REMOTE_DIR/images-$SHA.tar; docker image prune -f >/dev/null 2>&1 || true"

echo "==> 部署完成：https://$SITE_DOMAIN 就绪（tag ${SHA:0:12}）"
echo "==> 日志查看：https://$(env_value LOGS_DOMAIN "$ENV_INFRA")"
