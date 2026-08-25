# bl-studio

AI 媒体生成平台（文生图 / 文生视频 / 音频 / 文本），由 **bailian-studio** 与 **bailian-hub** 合并重写而来。

**本仓库的定位**：
- 合并原 Vue（web-vue）与 React（web）两个前端为**单个 React 前端**（zustand + react-router + shadcn/ui + Tailwind v4 + react-window 虚拟滚动）；
- 后端保留已验证的强架构（任务队列 + outbox + SSE、manifest 驱动、包边界门禁），并迁移工具链到 **pnpm + turbo**；
- **bailian-hub 已并入本仓库**：`packages/model-core` 的 51 份 manifest 是唯一数据源（39 启用 / 12 个 vidu「暂未开通」置灰；transport/rules/pricing 全在 manifest 里），纯函数校验（`validateModelParams` 等）前后端共享，git 即版本——无外部 SDK、npm 发布或 hash 对账仪式。

## 技术栈

| 层 | 选型 |
|---|---|
| 包管理 / 编排 | **pnpm 10 + turbo 2**（整体都使用 pnpm） |
| Node 运行时 | **Node ≥ 24**（`import.meta.main` 原生） |
| API 运行时 | **Bun**（唯一例外：Elysia 用 `bun apps/api/src/index.ts` 启动） |
| Worker 运行时 | Node + **tsx** |
| API 框架 | Elysia 1.4 |
| ORM | Drizzle（Postgres 24 张表） |
| 前端 | React 19 + Vite 8 + **zustand** + react-router 8 + **shadcn/ui** + Tailwind CSS 4 + **react-window** + sonner |
| 登录 | 邮箱密码 + **GitHub OAuth**（会话 http-only cookie） |
| 密码哈希 | @node-rs/argon2（argon2id） |
| 测试 | **Vitest 4**（后端包 + 前端纯函数层，Node 上运行） |
| 实时 | Postgres `generation_events` outbox + `NOTIFY` → API `LISTEN` → **SSE** |

## 快速开始

```bash
pnpm install

# 启动依赖：dev/test Postgres + Mailpit
pnpm run db:up          # dev DB :55431
pnpm run db:test:up     # test DB :55432
pnpm run db:migrate     # 首次初始化 dev DB；已有库继续应用新迁移
pnpm run db:migrate:test # 首次初始化 test DB；已有库继续应用新迁移

# 本地环境文件（gitignored）
# macOS/Linux:
cp .env.example .env
cp .env.test.example .env.test
# Windows PowerShell:
# Copy-Item .env.example .env
# Copy-Item .env.test.example .env.test
# 如需 Worker 真正调 DashScope，填入 DASHSCOPE_API_KEY

# 同时启动 API(5003, bun) / Worker(tsx) / Web(5002, vite)
pnpm run dev
```

如果本机已有其他项目占用默认 Docker 端口，可在当前 PowerShell 会话中覆盖宿主机端口；同时把 `.env` 中的 `DATABASE_URL`/`SMTP_PORT` 改为对应值：

```powershell
$env:BL_STUDIO_DEV_POSTGRES_PORT = '55441'
$env:BL_STUDIO_DEV_MAILPIT_SMTP_PORT = '11125'
$env:BL_STUDIO_DEV_MAILPIT_UI_PORT = '18125'
pnpm run db:up
```

打开 http://localhost:5002 即可创作。

> API 由 Bun 启动（Elysia 原生效能路径）；Worker、脚本、db 工具、测试均走 pnpm/Node。

### Windows 首次运行

要求：Node 24.12.x、pnpm 10.9.0、Bun 1.4.x、Docker Desktop。先确认 `docker info`
可以访问 Linux engine，再执行上面的安装和数据库命令。测试/verify/db 命令已使用
跨平台进程调用，不需要 Git Bash。

开发数据库使用 named volume，普通 `pnpm run db:down` 会保留数据；只有明确需要重置
时才执行：

```powershell
docker compose -f deploy/docker/compose.yaml down -v
```

本地生产形态演练需要 Linux 版 ffmpeg/ffprobe，Windows 宿主机的 `.exe` 不能直接挂进
Linux 容器。准备一次：

```powershell
pnpm run fetch:static-ffmpeg:windows
pnpm run deploy:rehearsal:up
```

生产发布脚本仍依赖 Linux Bash、rsync 和远程 Linux 命令；Windows 上请在 WSL/Linux
环境执行，或使用 Linux CI，不要在普通 PowerShell 中直接运行 `deploy:prod`。

## 常用命令

```bash
pnpm run lint             # Biome lint（TS/TSX/JS，跨平台）
pnpm run typecheck        # 全仓 typecheck（tsc --noEmit）
pnpm run typecheck:root   # 根 scripts + tests 的 typecheck
pnpm run test             # 根契约测试 + 全仓 vitest（串行，共享 test DB）
pnpm run test:coverage    # 覆盖率
pnpm run verify           # migrations + boundaries + manifests + lint + typecheck + test
pnpm run check:boundaries # 包边界（import 规则）
pnpm run check:manifests  # 模型 manifest 一致性
pnpm run model:acceptance # 所有 enabled 模型的离线请求/响应矩阵
pnpm run model:acceptance -- --live=<model-id> # 单模型真实供应商 canary（需 DASHSCOPE_API_KEY）
pnpm run db:studio        # drizzle-kit studio
pnpm run e2e              # Playwright（需 test DB）
```

rehearsal 默认使用 Web `5012`、API `5013`、Postgres `55433`；可用 `BL_STUDIO_REHEARSAL_*_PORT` 覆盖。若运行 `deploy:rehearsal:smoke`，同步设置 `REHEARSAL_API_ORIGIN` 和 `REHEARSAL_WEB_ORIGIN`。

## 架构

```text
Web (apps/web, React 19 + zustand + shadcn/ui)   Admin (apps/admin, 同源 /admin，仅 admin 角色)
              │ @bailian-studio/api-client（zod 契约层）            │
              ▼                                                 ▼
        apps/api (Elysia, :5003, 由 Bun 启动)
              │ Postgres repository + generation_events outbox + NOTIFY
              ▼
        apps/worker (任务认领 FOR UPDATE SKIP LOCKED → DashScope → 产物持久化)
              │
        packages/（shared / model-core / event-bus / db / generation-repository /
                  auth / storage / provider-dashscope / task-engine /
                  credit-ledger / media-repository / api-client / design-tokens）
```

- **包边界即架构**：`check:boundaries` 用正则强制执行「谁可以 import 谁」；`provider-dashscope` 是唯一受边界约束的执行包（只被 worker 消费），`model-core` 是前后端共享的纯数据 + 纯函数叶子。
- **manifest 驱动模型**：`packages/model-core/src/manifests/` 是唯一数据源（含 transport/rules/pricing/parameters），新增模型 = 加一份 manifest + 注册表一行，provider/前端零代码扩展；web 表单用 `validateModelParams` 做提交前实时校验，与服务端等价。
- **SSE 实时管线**：DB outbox 是事实来源，SSE 事件携带 recordId 作「失效提示」，前端只做 `refreshRecord(id)`，不直接写数据。
- **前端状态**：zustand（auth / 模型目录 / 任务列表 / 资产 / 积分 / 通知）+ 纯函数业务层（参数投影、提示词引用转换、幂等指纹），页面不直接 fetch。

## 前端目录速览（apps/web）

```text
src/
├── lib/          纯函数（可单测）：parameter-form-schema / parameter-validation /
│                 model-modes（级联子模式+暂未开通置灰）/ reference-format /
│                 generation-submit / generation-failure / idempotency /
│                 chunk-recovery / creation-presets / deeplink-params /
│                 user-error / model-description / labels / money
├── stores/       zustand：auth（含 auth-dialog）/ model-catalog / generations /
│                 generation-artifacts / assets / reference-assets / credits /
│                 notifications（登出统一 resetPrivateData）
├── hooks/        use-generation-events（SSE 失效驱动）/ use-media-job / 缩略图轮询
├── components/   ui/（shadcn 60+ 组件）+ layout / auth / create / generations / assets / shared
└── pages/        Create / Catalog / Generations / GenerationDetail / Functions /
                  Library / Gallery / Prompts / SharedGeneration / auth 五页
```

`apps/admin` 是精简的管理后台（同 `apps/web` 的 shadcn/ui + zustand + api-client），
同源 `/admin` 挂载（nginx 反代，无需新域名/新证书）：`/login`、`/users`（用户列表，
含多选批量封禁/解封/赠送/删除）、`/users/:id`（详情/积分/资产）、`/stats`（调用统计）、
`/analytics`（成本毛利 + 留存漏斗）、`/feedback`（反馈管理）。路由守卫要求 `role === 'admin'`。

## 测试策略

- **后端包**：vitest（node 环境），覆盖状态机、仓储、provider、路由契约。
- **前端**：vitest + happy-dom，只测**纯函数层**（参数投影、引用转换、幂等、错误本地化）——不测 UI/样式（样式后续还会调整）。
- **根契约**：`tests/` + `scripts/**/*.test.ts`（包边界、manifest、Docker 清单）。

## 部署

单机 Docker Compose + **宿主机 nginx + certbot** 自动 HTTPS（Let's Encrypt；本仓库不内置 Caddy），日志经 Loki + Alloy + Grafana 集中可查（`logs.yxswy.com`）。生产镜像见 `deploy/docker/Dockerfile`（oven/bun 基座 + Node 24 + pnpm；API 用 bun，Worker 用 tsx），配置模板在 `.env.production.example` 与 `.env.prod-infra.example`（均 gitignored）。发布前运行 `pnpm run verify`，然后 `pnpm run deploy:prod` 一键部署；只改前端时用 `pnpm run deploy:prod:web` 走 web-only 快速发版（约 20MB，不动 api/worker）。新库首次部署后需一次性播种模型成本：`pnpm run db:seed:model-costs`（生产用 `docker compose run --rm migrate pnpm exec tsx scripts/db/seed-model-costs.ts`）。完整运维手册见 `docs/03-ops.md`，部署踩坑清单见 `docs/04-deployment-playbook.md`。
