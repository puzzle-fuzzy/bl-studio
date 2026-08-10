#!/usr/bin/env bash
# 回滚到服务器上已有的旧镜像（P0-08）。
#
# 原理：生产镜像按不可变 SHA tag 保留在服务器 docker 里（docker image prune -f
# 只清无 tag 悬空镜像，带 SHA tag 的旧镜像会保留），所以回滚 = 把
# BAILIAN_STUDIO_RELEASE_TAG 指回旧 SHA，再在服务器上 `up -d --no-build`。
# 不重传镜像、不重跑迁移（迁移只前向推进；回滚后代码/数据不一致需另行处理）。
#
# 用法：pnpm run deploy:rollback <40位完整 Git SHA>
# 前置：infra/env/.env.prod-infra 存在且含 DEPLOY_HOST / DEPLOY_REMOTE_DIR，
#       旧 SHA 已全量部署过（镜像已在服务器）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_APP="$REPO_ROOT/infra/env/.env.production"
ENV_INFRA="$REPO_ROOT/infra/env/.env.prod-infra"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

SHA="${1:-}"
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "用法：pnpm run deploy:rollback [--dry-run] <40位完整 Git SHA>（如 pnpm run deploy:rollback \$(git rev-parse HEAD~1)）" >&2
  exit 1
fi

fail() { echo "回滚失败：$*" >&2; exit 1; }

[[ -f "$ENV_APP" ]] || fail "缺少 $ENV_APP"
[[ -f "$ENV_INFRA" ]] || fail "缺少 $ENV_INFRA"

# 与 deploy-prod.sh 相同的 dotenv 安全读取（只取首个 = 后内容，不展开 $/空格）。
env_value() {
  local key="$1" file="$2"
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/,""); print }' "$file" | tail -n 1
}

DEPLOY_HOST="$(env_value DEPLOY_HOST "$ENV_INFRA")"
DEPLOY_REMOTE_DIR="$(env_value DEPLOY_REMOTE_DIR "$ENV_INFRA")"
DEPLOY_SSH_KEY="$(env_value DEPLOY_SSH_KEY "$ENV_INFRA")"
[[ -n "$DEPLOY_HOST" ]] || fail "缺少 DEPLOY_HOST"
[[ -n "$DEPLOY_REMOTE_DIR" ]] || fail "缺少 DEPLOY_REMOTE_DIR"

source "$REPO_ROOT/infra/scripts/resolve-deploy-ssh-key.sh"
DEPLOY_SSH_KEY="$(resolve_deploy_ssh_key "$DEPLOY_SSH_KEY")"
if [[ -n "$DEPLOY_SSH_KEY" && ! -f "$DEPLOY_SSH_KEY" ]]; then
  fail "DEPLOY_SSH_KEY 不存在或无法从当前 Bash 环境访问"
fi
DEPLOY_SSH_KNOWN_HOSTS="$(resolve_deploy_ssh_known_hosts "$DEPLOY_SSH_KEY")"

ssh_cmd() {
  deploy_ssh "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$DEPLOY_HOST" "$1"
}

echo "==> 确认旧镜像 $SHA 已在服务器（不重传）"
if ! ssh_cmd "docker image inspect bailian-studio-runtime:$SHA >/dev/null 2>&1 && docker image inspect bailian-studio-web:$SHA >/dev/null 2>&1"; then
  fail "服务器缺少 bailian-studio-{runtime,web}:$SHA（可能从未全量部署过）。请改用 pnpm run deploy:prod 重新部署。"
fi

REMOTE_INFRA="$DEPLOY_REMOTE_DIR/infra"
COMPOSE="docker compose --env-file $REMOTE_INFRA/env/.env.prod-infra -f $REMOTE_INFRA/docker/docker-compose.prod.yml"
if [[ "$DRY_RUN" == true ]]; then
  echo "==> dry-run：仅检查旧镜像与远程 Compose 配置，不修改 env、不 rsync、不启动服务"
  ssh_cmd "$COMPOSE config --services >/dev/null"
  echo "==> dry-run 通过：$SHA 可用于真实回滚（真实回滚仍可能遇到前向迁移后的 schema 不兼容）"
  exit 0
fi

# 把 tag 幂等写回本地两个 env 文件（与 deploy-prod.sh 的注入方式一致）。
inject_tag() {
  local file="$1"
  if grep -q '^BAILIAN_STUDIO_RELEASE_TAG=' "$file"; then
    sed -i.bak "s/^BAILIAN_STUDIO_RELEASE_TAG=.*/BAILIAN_STUDIO_RELEASE_TAG=$SHA/" "$file"
    rm -f "$file.bak"
  else
    printf 'BAILIAN_STUDIO_RELEASE_TAG=%s\n' "$SHA" >> "$file"
  fi
}
inject_tag "$ENV_APP"
inject_tag "$ENV_INFRA"

# 把更新后的 env 同步到服务器（本地 docker context 默认 Desktop，必须走 SSH 在服务器上 up）。
ssh_cmd "mkdir -p $REMOTE_INFRA/env"
deploy_rsync "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_KNOWN_HOSTS" "$ENV_APP" "$ENV_INFRA" "$DEPLOY_HOST:$REMOTE_INFRA/env/"
ssh_cmd "chmod 600 $REMOTE_INFRA/env/.env.production $REMOTE_INFRA/env/.env.prod-infra"

echo "==> 服务器上复用旧镜像滚动 up（--no-build --pull never）"
ssh_cmd "$COMPOSE up -d --no-build --pull never"

echo "==> 回滚完成：BAILIAN_STUDIO_RELEASE_TAG=$SHA（tag ${SHA:0:12}）"
