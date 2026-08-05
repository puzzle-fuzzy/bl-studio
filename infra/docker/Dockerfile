# bl-studio 生产镜像。
#
# 运行时约定：
# - 包管理/任务编排：pnpm + turbo（整体都使用 pnpm）；
# - 唯一例外：Elysia API 进程用 Bun 运行时启动（bun apps/api/src/index.ts）；
# - Worker 用 Node/tsx 启动（pnpm exec tsx apps/worker/src/index.ts）。
#
# 镜像分层要点：
# - `base`：oven/bun + Node 24 + pnpm（无 node_modules）；
# - `workspace`：**全量依赖**（含 typescript/vite 等构建/测试期工具），仅供 web-build；
# - `runtime`：**只装生产依赖**（pnpm install --prod），供 api/worker/migrate。
#   全量 devDeps 永远不进入 runtime 层链，runtime 镜像才真正变小
#   （node_modules 全量 ~497M → 生产 ~288M，docker save 传输 ~440MB → ~350MB）。

FROM oven/bun:1.3.14-debian AS base

# 依赖安装用 pnpm（需要 node/npm）；Worker 运行时也用 node/tsx。
# 注意：项目要求 Node ≥24（`import.meta.main` 原生，Node 20 无此特性会让 worker
# 静默退出），apt 默认 nodejs 是 v20 —— 必须从官方二进制安装 Node LTS。
# TARGETARCH 是 BuildKit 自动注入的构建参数（amd64/arm64），保证在 x64 与
# arm64（Apple Silicon 开发机）主机上都能拿到对应架构的 Node。
ARG NODE_VERSION=24.18.0
ARG TARGETARCH
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl xz-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && case "$TARGETARCH" in \
       amd64|"") NODE_ARCH="x64";; \
       arm64) NODE_ARCH="arm64";; \
       *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1;; \
     esac \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
       -o /tmp/node.tar.xz \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm /tmp/node.tar.xz \
  && npm install -g pnpm@10.9.0 \
  && node --version

WORKDIR /app

# ── workspace：全量依赖（含构建/测试期工具），供 web-build 使用 ──────────────
FROM base AS workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
COPY apps/worker/package.json ./apps/worker/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth/package.json ./packages/auth/
COPY packages/bailian-adapter/package.json ./packages/bailian-adapter/
COPY packages/credit-ledger/package.json ./packages/credit-ledger/
COPY packages/db/package.json ./packages/db/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/generation-repository/package.json ./packages/generation-repository/
COPY packages/media-repository/package.json ./packages/media-repository/
COPY packages/model-core/package.json ./packages/model-core/
COPY packages/provider-dashscope/package.json ./packages/provider-dashscope/
COPY packages/provider-health/package.json ./packages/provider-health/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/task-engine/package.json ./packages/task-engine/

RUN pnpm install --frozen-lockfile

COPY turbo.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra/scripts ./infra/scripts

# ── runtime：只装生产依赖（不含 devDeps），供 api/worker/migrate ─────────────
FROM base AS runtime

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
COPY apps/worker/package.json ./apps/worker/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth/package.json ./packages/auth/
COPY packages/bailian-adapter/package.json ./packages/bailian-adapter/
COPY packages/credit-ledger/package.json ./packages/credit-ledger/
COPY packages/db/package.json ./packages/db/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY packages/generation-repository/package.json ./packages/generation-repository/
COPY packages/media-repository/package.json ./packages/media-repository/
COPY packages/model-core/package.json ./packages/model-core/
COPY packages/provider-dashscope/package.json ./packages/provider-dashscope/
COPY packages/provider-health/package.json ./packages/provider-health/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/task-engine/package.json ./packages/task-engine/

# 生产依赖：tsx/drizzle-kit/postgres 在根 dependencies；各包自带 prod 依赖。
# 因为 runtime 从 base 开始、从未装过全量依赖，node_modules 就是纯生产集，
# 全量 devDeps（typescript/vite/vitest/playwright/turbo）不在本层链里。
RUN pnpm install --prod --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
COPY infra/scripts ./infra/scripts

# Worker 媒体提取与 API 侧上传探测都需要 ffprobe。
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV FFPROBE_PATH=ffprobe

# 应用代码与依赖不可变、只读；可写的产物目录是单独挂载卷或 OSS。
USER bun

EXPOSE 5003

ARG BAILIAN_STUDIO_RELEASE_TAG=unknown
LABEL org.opencontainers.image.revision="${BAILIAN_STUDIO_RELEASE_TAG}"

# ── web-build：基于 workspace（有 typescript/vite）构建前端 ──────────────────
FROM workspace AS web-build

ARG VITE_API_ORIGIN=
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}

# 同源两个前端：主站 apps/web + 管理后台 apps/admin（nginx 以 /admin 前缀服务）。
RUN pnpm --filter @bailian-studio/web build && pnpm --filter @bailian-studio/admin build

FROM nginx:1.27-alpine AS web

COPY infra/nginx/bailian-studio.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY --from=web-build /app/apps/admin/dist /usr/share/nginx/html-admin

EXPOSE 5002

ARG BAILIAN_STUDIO_RELEASE_TAG=unknown
LABEL org.opencontainers.image.revision="${BAILIAN_STUDIO_RELEASE_TAG}"
