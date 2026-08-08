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
#   - verify 门禁：脚本会在干净工作区上强制跑 `pnpm run verify`（test DB 环境），
#     未全绿即中止。紧急时可 DEPLOY_SKIP_VERIFY=1 显式绕过。
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
ENV_BACKUP="$REPO_ROOT/infra/env/.env.prod-backup"

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

# 只把 OSS 灾备所需的五项变量投影给 backup 容器，避免把 API/Worker/SMTP 等
# 应用机密通过 env_file 扩散到备份服务。
pnpm exec tsx "$REPO_ROOT/infra/scripts/prepare-backup-env.ts" \
  || fail "prepare-backup-env 未通过"
[[ -f "$ENV_BACKUP" ]] || fail "缺少 ${ENV_BACKUP}"

# ── 预检 2.5：verify 硬门禁（P0-08）─────────────────────────────
# CI 只覆盖「推送 main 的 commit」；本地未推送/分支 commit 直接 deploy 会绕过 CI。
# 因此这里在干净工作区（= 已捕获 SHA）之后强制跑完整 verify。
# 环境：test DB 连接串来自 infra/env/.env.test（测试库 :55432）。
# 紧急热修可用 DEPLOY_SKIP_VERIFY=1 显式绕过（会打印告警，需自行评估）。
if [[ "${DEPLOY_SKIP_VERIFY:-0}" != "1" ]]; then
  if [[ -f "$REPO_ROOT/infra/env/.env.test" ]]; then
    echo "==> 前置 verify 门禁（test DB 环境，全绿才继续）"
    pnpm exec dotenv -e "$REPO_ROOT/infra/env/.env.test" -- pnpm run verify \
      || fail "verify 未通过；修好后重新部署（紧急时可 DEPLOY_SKIP_VERIFY=1 绕过，需自行评估）"
  else
    fail "缺少 infra/env/.env.test：verify 门禁需要 test DB 连接串（参考 infra/env/.env.test.example）"
  fi
else
  echo "!! 已跳过 verify 门禁（DEPLOY_SKIP_VERIFY=1），请自行确认改动质量" >&2
fi

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
LEGAL_ENTITY="$(env_value VITE_LEGAL_ENTITY "$ENV_APP")"
LEGAL_CONTACT_EMAIL="$(env_value VITE_LEGAL_CONTACT_EMAIL "$ENV_APP")"
LEGAL_EFFECTIVE_DATE="$(env_value VITE_LEGAL_EFFECTIVE_DATE "$ENV_APP")"
# 目标服务器 CPU 架构。本机（Apple Silicon）与服务器（x86_64）架构不同时，
# 必须显式指定服务器架构跨平台构建，否则产出的 arm64 镜像无法在 x64 上运行。
# 若本机与服务器同为 x86_64，可在 .env.prod-infra 置空走默认 linux/amd64。
DEPLOY_PLATFORM="$(env_value DEPLOY_PLATFORM "$ENV_INFRA")"
[[ -n "$DEPLOY_HOST" ]] || fail "缺少 DEPLOY_HOST"
[[ -n "$DEPLOY_REMOTE_DIR" ]] || fail "缺少 DEPLOY_REMOTE_DIR"
[[ -n "$SITE_DOMAIN" ]] || fail "缺少 SITE_DOMAIN"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"

# P1-41：本机 Clash fake-ip 劫持 DNS，本地 dig/curl 解析不可信（CLAUDE.md 已注明，
# 查 DNS 要在服务器上 getent hosts）。公网冒烟直接按服务器 IP 连接（curl --resolve
# 仍保留 SNI 与证书校验，功能等价于走域名），避免被 fake-ip 解析到 127.0.0.1。
SERVER_HOST="${DEPLOY_HOST##*@}"
SERVER_HOST="${SERVER_HOST%%:*}"
# DEPLOY_HOST 通常是 SSH config 别名（例如 yxswy-server），而 curl --resolve
# 只能接受真实 IP/可解析主机名。优先使用 OpenSSH 展开的 HostName，避免本机
# fake-ip/DNS 代理把公网冒烟导向错误地址。
SSH_RESOLVED_HOST="$(ssh -G "$DEPLOY_HOST" 2>/dev/null | awk '$1=="hostname" {print $2; exit}' || true)"
SERVER_HOST="${SSH_RESOLVED_HOST:-$SERVER_HOST}"

# 不用数组（macOS bash 3.2 下 set -u + 空数组展开会误报 unbound variable）。
ssh_cmd() {
  if [[ -n "$DEPLOY_SSH_KEY" ]]; then
    ssh -i "$DEPLOY_SSH_KEY" "$DEPLOY_HOST" "$1"
  else
    ssh "$DEPLOY_HOST" "$1"
  fi
}

echo "==> 部署目标：${DEPLOY_HOST}（镜像 tag: ${SHA:0:12}）"

# ── 提示：仅前端改动时 web-only 更省（非阻断）────────────────────
# 上一次提交只动了 apps/web|apps/admin（docs 不计入），全量部署会白传 runtime 镜像。
changed_files="$(git diff --name-only "$SHA~1" "$SHA" 2>/dev/null || true)"
non_frontend="$(printf '%s\n' "$changed_files" | grep -vE '^(apps/(web|admin)|docs)/' | grep -v '^$' || true)"
if [[ -n "$changed_files" && -z "$non_frontend" ]] && printf '%s\n' "$changed_files" | grep -qE '^apps/(web|admin)/'; then
  echo "==> 提示：本次提交只改了前端（apps/web|apps/admin）。"
  echo "==> 前端热修建议用 pnpm run deploy:prod:web（传输 ~20MB，不重传 runtime 镜像）。"
  echo "==> 若确实需要全量部署（连带后端/DB 变更），忽略本提示继续。"
fi

# ── 预检 4：宿主机静态 ffmpeg/ffprobe 就绪（runtime 镜像不再打包它们）────────
# 路径可经 FFMPEG_HOST_DIR 覆盖（默认 /opt/bailian-studio/ffmpeg），与
# docker-compose.prod.yml 的 x-ffmpeg-mounts 保持一致。
FFMPEG_HOST_DIR="$(env_value FFMPEG_HOST_DIR "$ENV_INFRA")"
FFMPEG_HOST_DIR="${FFMPEG_HOST_DIR:-/opt/bailian-studio/ffmpeg}"
echo "==> 预检：宿主机静态 ffmpeg/ffprobe（${FFMPEG_HOST_DIR}）"
if ! ssh_cmd "test -x ${FFMPEG_HOST_DIR}/ffmpeg && test -x ${FFMPEG_HOST_DIR}/ffprobe"; then
  fail "服务器缺少静态 ffmpeg/ffprobe（${FFMPEG_HOST_DIR}）。先运行：infra/scripts/fetch-static-ffmpeg.sh"
fi

# ── 本机构镜像（SHA tag，不可变）─────────────────────────────────
echo "==> 构建 runtime / web / backup 镜像（平台 ${DEPLOY_PLATFORM}）"
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target runtime \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  -t "bailian-studio-runtime:$SHA" .
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile --target web \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  --build-arg VITE_API_ORIGIN= \
  --build-arg VITE_WEB_ORIGIN="https://$SITE_DOMAIN" \
  --build-arg VITE_LEGAL_ENTITY="$LEGAL_ENTITY" \
  --build-arg VITE_LEGAL_CONTACT_EMAIL="$LEGAL_CONTACT_EMAIL" \
  --build-arg VITE_LEGAL_EFFECTIVE_DATE="$LEGAL_EFFECTIVE_DATE" \
  -t "bailian-studio-web:$SHA" .
docker build --platform "$DEPLOY_PLATFORM" -f infra/docker/Dockerfile.backup \
  --build-arg BAILIAN_STUDIO_RELEASE_TAG="$SHA" \
  -t "bailian-studio-backup:$SHA" .

# ── docker save → rsync 到服务器 ─────────────────────────────────
echo "==> 导出并传输镜像与配置"
docker save -o "images-$SHA.tar" \
  "bailian-studio-runtime:$SHA" "bailian-studio-web:$SHA" "bailian-studio-backup:$SHA"

REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"
ssh_cmd "mkdir -p $REMOTE_INFRA/docker $REMOTE_INFRA/env $REMOTE_INFRA/loki $REMOTE_INFRA/alloy $REMOTE_INFRA/grafana $REMOTE_INFRA/nginx $REMOTE_INFRA/scripts"

rsync -az "images-$SHA.tar" "$DEPLOY_HOST:$DEPLOY_REMOTE_DIR/"
rsync -az infra/docker/docker-compose.prod.yml "$DEPLOY_HOST:$REMOTE_INFRA/docker/"
# 三个目录分别同步到自己的目标目录；多源 rsync 指向同一目标会在服务器
# 已存在错误路径时把应为单文件的 config.alloy/loki.yaml 留成目录，破坏单文件挂载。
rsync -az infra/loki/ "$DEPLOY_HOST:$REMOTE_INFRA/loki/"
rsync -az infra/alloy/ "$DEPLOY_HOST:$REMOTE_INFRA/alloy/"
rsync -az infra/grafana/ "$DEPLOY_HOST:$REMOTE_INFRA/grafana/"
# 宿主机 nginx 边缘：容器内 nginx 配置（烘焙进镜像）+ 两个站点模板 + 边缘接入脚本。
rsync -az infra/nginx/ "$DEPLOY_HOST:$REMOTE_INFRA/nginx/"
rsync -az infra/scripts/setup-host-edge.sh infra/scripts/fetch-static-ffmpeg.sh infra/scripts/production-monitor.sh infra/scripts/restore-rehearsal.sh "$DEPLOY_HOST:$REMOTE_INFRA/scripts/"
rsync -az "$ENV_APP" "$ENV_INFRA" "$ENV_BACKUP" "$DEPLOY_HOST:$REMOTE_INFRA/env/"

# 服务器侧收紧 env 文件权限（含真实凭据）。
ssh_cmd "chmod 600 $REMOTE_INFRA/env/.env.production $REMOTE_INFRA/env/.env.prod-infra $REMOTE_INFRA/env/.env.prod-backup"

# ── 服务器：docker load + 拉基础镜像 + 迁移 + 滚动 up ────────────
echo "==> 服务器 docker load"
ssh_cmd "docker load -i $DEPLOY_REMOTE_DIR/images-$SHA.tar"

COMPOSE="docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra -f $REMOTE_INFRA/docker/docker-compose.prod.yml"

echo "==> 拉取核心基础镜像（幂等；观测栈启用时另行 pull）"
ssh_cmd "$COMPOSE pull postgres >/dev/null"

echo "==> 执行数据库迁移"
ssh_cmd "$COMPOSE run --rm migrate"

echo "==> 滚动启动核心栈"
# migrate 是 restart:no 的一次性服务，已在上一步 run --rm 跑过；scale 到 0
# 避免 up -d 再启一个 migrate 容器把迁移跑第二遍（P2-29）。依赖它的
# api/worker 不会等待该服务（scale=0 即视为跳过），迁移已完成，直接起。
ssh_cmd "$COMPOSE up -d --no-build --pull never --scale migrate=0"

echo "==> 接入宿主机 nginx 边缘（证书 + conf.d，幂等）"
ssh_cmd "bash $REMOTE_INFRA/scripts/setup-host-edge.sh $REMOTE_INFRA"

echo "==> OSS 灾备冒烟（真实 pg_dump + OSS 上传）"
ssh_cmd "$COMPOSE run --rm --no-deps --entrypoint /usr/local/bin/backup-postgres.sh backup"

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
  if curl -fsS --max-time 10 --resolve "$SITE_DOMAIN:443:$SERVER_HOST" "https://$SITE_DOMAIN/api/health/ready" >/dev/null 2>&1; then
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
