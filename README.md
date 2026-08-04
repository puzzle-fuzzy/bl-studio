# bl-studio

AI 媒体生成平台（文生图 / 文生视频 / 音频 / 文本），由 **bailian-studio** 与 **bailian-hub** 合并重写而来。

**本仓库的定位**：
- 合并原 Vue（web-vue）与 React（web）两个前端为**单个 React 前端**（zustand + react-router + shadcn/ui + Tailwind v4 + react-window 虚拟滚动）；
- 后端保留已验证的强架构（任务队列 + outbox + SSE、manifest 驱动、包边界门禁），并迁移工具链到 **pnpm + turbo**；
- bailian-hub 作为外部「模型书架」仓库保留，经 `@bailian-studio/bailian-adapter` 集成。

## 技术栈

| 层 | 选型 |
|---|---|
| 包管理 / 编排 | **pnpm 10 + turbo 2**（整体都使用 pnpm） |
| Node 运行时 | **Node ≥ 24**（`import.meta.main` 原生） |
| API 运行时 | **Bun**（唯一例外：Elysia 用 `bun apps/api/src/index.ts` 启动） |
| Worker 运行时 | Node + **tsx** |
| API 框架 | Elysia 1.4 |
| ORM | Drizzle（Postgres 18 张表） |
| 前端 | React 19 + Vite 8 + **zustand** + react-router 8 + **shadcn/ui** + Tailwind CSS 4 + **react-window** + sonner |
| 密码哈希 | @node-rs/argon2（argon2id） |
| 测试 | **Vitest 4**（后端包 + 前端纯函数层，Node 上运行） |
| 实时 | Postgres `generation_events` outbox + `NOTIFY` → API `LISTEN` → **SSE** |

## 快速开始

```bash
pnpm install

# 启动依赖：dev/test Postgres + Mailpit
pnpm run db:up          # dev DB :55431
pnpm run db:test:up     # test DB :55432
pnpm run db:push        # 推送 schema 到 dev DB
pnpm run db:push:test   # 推送 schema 到 test DB

# 本地环境文件（gitignored）
cp infra/env/.env.example infra/env/.env
# 如需 Worker 真正调 DashScope，填入 DASHSCOPE_API_KEY

# 同时启动 API(5003, bun) / Worker(tsx) / Web(5002, vite)
pnpm run dev
```

打开 http://localhost:5002 即可创作。

> API 由 Bun 启动（Elysia 原生效能路径）；Worker、脚本、db 工具、测试均走 pnpm/Node。

## 常用命令

```bash
pnpm run typecheck        # 全仓 typecheck（tsc --noEmit，无 ESLint）
pnpm run typecheck:root   # 根 infra/scripts + tests 的 typecheck
pnpm run test             # 根契约测试 + 全仓 vitest（串行，共享 test DB）
pnpm run test:coverage    # 覆盖率
pnpm run verify           # baseline + boundaries + manifests + typecheck + test
pnpm run check:boundaries # 包边界（import 规则）
pnpm run check:manifests  # 模型 manifest 一致性
pnpm run db:studio        # drizzle-kit studio
pnpm run e2e              # Playwright（需 test DB）
```

## 架构

```text
Web (apps/web, React 19 + zustand + shadcn/ui)
              │ @bailian-studio/api-client（zod 契约层）
              ▼
        apps/api (Elysia, :5003, 由 Bun 启动)
              │ Postgres repository + generation_events outbox + NOTIFY
              ▼
        apps/worker (任务认领 FOR UPDATE SKIP LOCKED → DashScope → 产物持久化)
              │
        packages/（shared / model-core / event-bus / db / generation-repository /
                  auth / storage / provider-dashscope / task-engine /
                  bailian-adapter / credit-ledger / media-repository /
                  provider-health / api-client / design-tokens）
```

- **包边界即架构**：`check:boundaries` 用正则强制执行「谁可以 import 谁」；`bailian-adapter` 是外部 `@puzzle-fuzzy/bailian-sdk` 的唯一所有者。
- **manifest 驱动模型**：新增模型 = `packages/model-core/src/manifests/` 加一份 manifest + 注册表一行，provider/前端零代码扩展。
- **SSE 实时管线**：DB outbox 是事实来源，SSE 事件携带 recordId 作「失效提示」，前端只做 `refreshRecord(id)`，不直接写数据。
- **前端状态**：zustand（auth / 模型目录 / 任务列表 / 资产 / 积分 / 通知）+ 纯函数业务层（参数投影、提示词引用转换、幂等指纹），页面不直接 fetch。

## 前端目录速览（apps/web）

```text
src/
├── lib/          纯函数（可单测）：parameter-form-schema / reference-format /
│                 creation-presets / idempotency / user-error / labels / money
├── stores/       zustand：auth / model-catalog / generations / assets / credits /
│                 notifications（登出统一 resetPrivateData）
├── hooks/        use-generation-events（SSE 失效驱动）/ use-media-job / 缩略图轮询
├── components/   ui/（shadcn 60+ 组件）+ layout / auth / create / generations / assets / shared
└── pages/        Create / Catalog / Generations / GenerationDetail / Functions /
                  Library / SharedGeneration / auth 五页
```

## 测试策略

- **后端包**：vitest（node 环境），覆盖状态机、仓储、provider、路由契约。
- **前端**：vitest + happy-dom，只测**纯函数层**（参数投影、引用转换、幂等、错误本地化）——不测 UI/样式（样式后续还会调整）。
- **根契约**：`tests/` + `infra/scripts/*.test.ts`（包边界、manifest、Docker 清单）。

## 部署

生产镜像见 `infra/docker/Dockerfile`（oven/bun 基座 + node/pnpm；API 用 bun，Worker 用 tsx），Nginx 反代 `/api` + SSE，配置模板在 `infra/env/.env.production.example`。发布前运行 `pnpm run verify`。
