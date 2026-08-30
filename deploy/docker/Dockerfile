# bl-studio 生产镜像。
#
# 运行时约定：
# - 包管理/任务编排：bun + turbo（整体都使用 bun）；
# - Elysia API 进程用 Bun 运行时启动（bun apps/api/src/index.ts）；
# - Worker 用 Node/tsx 启动（node --import tsx apps/worker/src/index.ts）。
#
# 镜像分层要点：
# - `base`：oven/bun + Node 24（无 node_modules）；
# - `workspace`：**全量依赖**（含 typescript/vite 等构建/测试期工具），仅供 web-build；
# - `runtime`：**只装 api/worker/root 的生产依赖**（bun filtered install），供 api/worker/migrate。
#   全量 devDeps 永远不进入 runtime 层链，runtime 镜像才真正变小。

FROM oven/bun:1.4.0-debian AS base

# Node 24 供 Worker（node --import tsx）与 CLI 脚本使用。
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
  && node --version

WORKDIR /app

# ── workspace：全量依赖（含构建/测试期工具），供 web-build 使用 ──────────────
FROM base AS workspace

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/studio/package.json ./apps/studio/
COPY apps/admin/package.json ./apps/admin/
COPY apps/worker/package.json ./apps/worker/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/admin-repository/package.json ./packages/admin-repository/
COPY packages/audit-repository/package.json ./packages/audit-repository/
COPY packages/auth/package.json ./packages/auth/
COPY packages/credit-ledger/package.json ./packages/credit-ledger/
COPY packages/creative-asset-contracts/package.json ./packages/creative-asset-contracts/
COPY packages/creative-asset-compiler/package.json ./packages/creative-asset-compiler/
COPY packages/creative-asset-repository/package.json ./packages/creative-asset-repository/
COPY packages/db/package.json ./packages/db/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY packages/director-contracts/package.json ./packages/director-contracts/
COPY packages/director-repository/package.json ./packages/director-repository/
COPY packages/sse-protocol/package.json ./packages/sse-protocol/
COPY packages/generation-repository/package.json ./packages/generation-repository/
COPY packages/media-repository/package.json ./packages/media-repository/
COPY packages/persistence-runtime/package.json ./packages/persistence-runtime/
COPY packages/canvas-contracts/package.json ./packages/canvas-contracts/
COPY packages/canvas-execution/package.json ./packages/canvas-execution/
COPY packages/canvas-validation/package.json ./packages/canvas-validation/
COPY packages/canvas-repository/package.json ./packages/canvas-repository/
COPY packages/model-core/package.json ./packages/model-core/
COPY packages/provider-dashscope/package.json ./packages/provider-dashscope/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/task-engine/package.json ./packages/task-engine/
COPY packages/task-repository/package.json ./packages/task-repository/
COPY apps/writer/package.json ./apps/writer/
COPY packages/ui/package.json ./packages/ui/
COPY packages/lib-client/package.json ./packages/lib-client/
COPY packages/app-shell/package.json ./packages/app-shell/
COPY apps/canvas/package.json ./apps/canvas/

RUN bun install --frozen-lockfile

COPY turbo.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY data/fixtures ./data/fixtures

# ── runtime：只装生产依赖（不含 devDeps），供 api/worker/migrate ─────────────
FROM base AS runtime

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/studio/package.json ./apps/studio/
COPY apps/admin/package.json ./apps/admin/
COPY apps/worker/package.json ./apps/worker/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/audit-repository/package.json ./packages/audit-repository/
COPY packages/admin-repository/package.json ./packages/admin-repository/
COPY packages/auth/package.json ./packages/auth/
COPY packages/credit-ledger/package.json ./packages/credit-ledger/
COPY packages/creative-asset-contracts/package.json ./packages/creative-asset-contracts/
COPY packages/creative-asset-compiler/package.json ./packages/creative-asset-compiler/
COPY packages/creative-asset-repository/package.json ./packages/creative-asset-repository/
COPY packages/db/package.json ./packages/db/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY packages/director-contracts/package.json ./packages/director-contracts/
COPY packages/director-repository/package.json ./packages/director-repository/
COPY packages/sse-protocol/package.json ./packages/sse-protocol/
COPY packages/generation-repository/package.json ./packages/generation-repository/
COPY packages/media-repository/package.json ./packages/media-repository/
COPY packages/persistence-runtime/package.json ./packages/persistence-runtime/
COPY packages/canvas-contracts/package.json ./packages/canvas-contracts/
COPY packages/canvas-execution/package.json ./packages/canvas-execution/
COPY packages/canvas-validation/package.json ./packages/canvas-validation/
COPY packages/canvas-repository/package.json ./packages/canvas-repository/
COPY packages/model-core/package.json ./packages/model-core/
COPY packages/provider-dashscope/package.json ./packages/provider-dashscope/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/task-engine/package.json ./packages/task-engine/
COPY packages/task-repository/package.json ./packages/task-repository/
COPY apps/writer/package.json ./apps/writer/
COPY packages/ui/package.json ./packages/ui/
COPY packages/lib-client/package.json ./packages/lib-client/
COPY packages/app-shell/package.json ./packages/app-shell/
COPY apps/canvas/package.json ./apps/canvas/

# 生产依赖：tsx/drizzle-kit/postgres 在根 dependencies；api/worker 的 workspace
# 闭包由 filter 自动带入。web/admin 仅在 web-build 阶段需要，避免把 react/recharts
# 等前端运行时依赖复制进 api/worker 镜像。
RUN bun install --production --frozen-lockfile \
  --filter . \
  --filter @bailian-studio/api... \
  --filter @bailian-studio/worker...

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
# data/fixtures 供生产一次性播种（seed-model-costs.ts 的 model-costs.json 源数据）。
COPY data/fixtures ./data/fixtures

# ffmpeg/ffprobe 不再打进镜像（每次部署可省 ~150MB 传输）：api/worker 通过 compose
# bind-mount 宿主机 /opt/bailian-studio/ffmpeg 下的静态二进制（见 scripts/dev/fetch-static-ffmpeg.sh）。
# 静态版自包含、无共享库依赖，才能跨发行版（宿主机 rpm 系 → 容器 Debian）挂载。
# 未配 mount 的环境（纯 migrate/web）不需要 ffmpeg；媒体/探测功能在 api/worker 容器里失效前，
# 由 deploy 脚本预检保证宿主机二进制已就绪。
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV FFPROBE_PATH=ffprobe

# 应用代码与依赖不可变、只读；可写的产物目录是单独挂载卷或 OSS。
USER bun

EXPOSE 5003

ARG BAILIAN_STUDIO_RELEASE_TAG=unknown
ENV BAILIAN_STUDIO_RELEASE_TAG=${BAILIAN_STUDIO_RELEASE_TAG}
LABEL org.opencontainers.image.revision="${BAILIAN_STUDIO_RELEASE_TAG}"

# ── web-build：基于 workspace（有 typescript/vite）构建前端 ──────────────────
FROM workspace AS web-build

ARG VITE_API_ORIGIN=
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
ARG VITE_WEB_ORIGIN=
ARG VITE_LEGAL_ENTITY=
ARG VITE_LEGAL_CONTACT_EMAIL=
ARG VITE_LEGAL_EFFECTIVE_DATE=
ENV VITE_WEB_ORIGIN=${VITE_WEB_ORIGIN}
ENV VITE_LEGAL_ENTITY=${VITE_LEGAL_ENTITY}
ENV VITE_LEGAL_CONTACT_EMAIL=${VITE_LEGAL_CONTACT_EMAIL}
ENV VITE_LEGAL_EFFECTIVE_DATE=${VITE_LEGAL_EFFECTIVE_DATE}

# 同源四个前端：主站 apps/studio + 编剧台 apps/writer + 画布 apps/canvas（nginx 以 /writer 前缀服务）+ 管理后台 apps/admin（/admin 前缀）。
RUN bun run --filter @bailian-studio/studio build && bun run --filter @bailian-studio/writer build && bun run --filter @bailian-studio/canvas build && bun run --filter @bailian-studio/admin build

FROM nginx:1.27-alpine AS web

COPY deploy/nginx/bailian-studio.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/studio/dist /usr/share/nginx/html
COPY --from=web-build /app/apps/admin/dist /usr/share/nginx/html-admin
COPY --from=web-build /app/apps/writer/dist /usr/share/nginx/html-writer
COPY --from=web-build /app/apps/canvas/dist /usr/share/nginx/html-canvas

EXPOSE 5002

ARG BAILIAN_STUDIO_RELEASE_TAG=unknown
LABEL org.opencontainers.image.revision="${BAILIAN_STUDIO_RELEASE_TAG}"
