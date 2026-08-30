# bl-studio

AI 媒体生成平台（文生图 / 文生视频 / 音频 / 文本）。

**本仓库的定位**：
- 将原有前端重组为四个同源 React app：`studio` 创作工作区、`writer` 剧本台、`canvas` 画布和 `admin` 管理后台；
- 后端保留已验证的强架构（任务队列 + outbox + SSE、manifest 驱动、包边界门禁），并迁移工具链到 **bun + turbo**；
- **bailian-hub 已并入本仓库**：`packages/dashscope-manifests` 持有 DashScope manifest 及目录，`packages/model-core` 提供 provider-neutral 契约与纯函数校验（`validateModelParams` 等），git 即版本——无外部 SDK、npm 发布或 hash 对账仪式。

## 技术栈

| 层 | 选型 |
|---|---|
| 包管理 / 编排 | **bun 1.4 + turbo 2**（整体都使用 bun；Worker/脚本运行时仍是 Node 24） |
| Node 运行时 | **Node 24.x**（`import.meta.main` 原生；见 `.node-version`） |
| API 运行时 | **Bun**（唯一例外：Elysia 用 `bun apps/api/src/index.ts` 启动） |
| Worker 运行时 | Node + **tsx** |
| API 框架 | Elysia 1.4 |
| ORM | Drizzle + PostgreSQL |
| 前端 | React 19 + Vite 8 + **zustand** + react-router 8 + **shadcn/ui** + Tailwind CSS 4 + **react-window** + sonner |
| 登录 | 邮箱密码 + **GitHub OAuth**（会话 http-only cookie） |
| 密码哈希 | @node-rs/argon2（argon2id） |
| 测试 | **Vitest 4**（后端包 + 前端纯函数层，Node 上运行） |
| 实时 | Postgres `generation_events` outbox + `NOTIFY` → API `LISTEN` → **SSE** |

## 快速开始

```bash
bun install

# 启动依赖：dev/test Postgres + Mailpit
bun run db:up          # dev DB :55431
bun run db:test:up     # test DB :55432
bun run db:migrate     # 首次初始化 dev DB；已有库继续应用新迁移
bun run db:migrate:test # 首次初始化 test DB；已有库继续应用新迁移

# 本地环境文件（deploy/env 下，均 gitignored；只提交基础模板）
# macOS/Linux:
cp deploy/env/.env.example deploy/env/.env.dev
cp deploy/env/.env.example deploy/env/.env.test
# Windows PowerShell:
# Copy-Item deploy/env/.env.example deploy/env/.env.dev
# Copy-Item deploy/env/.env.example deploy/env/.env.test
# 如需 Worker 真正调 DashScope，填入 DASHSCOPE_API_KEY

# 同时启动 API(5003, bun) / Worker(tsx) / 三个用户前端
# Studio(5002) / Writer(5006) / Canvas(5007)
bun run dev

# 运行 API、Worker 和三个前端的启动健康检查（需先启动 bun run dev）
bun run dev:smoke
```

管理后台不属于默认用户开发拓扑，需要时单独启动：

```bash
bun run dev:admin # Admin :5004
```

如果本机已有其他项目占用默认 Docker 端口，可在当前 PowerShell 会话中覆盖宿主机端口；同时把 `deploy/env/.env.dev` 中的 `DATABASE_URL`/`SMTP_PORT` 改为对应值：

```powershell
$env:BL_STUDIO_DEV_POSTGRES_PORT = '55441'
$env:BL_STUDIO_DEV_MAILPIT_SMTP_PORT = '11125'
$env:BL_STUDIO_DEV_MAILPIT_UI_PORT = '18125'
bun run db:up
```

打开以下入口即可访问对应工作区：

- Studio：<http://localhost:5002>
- Writer：<http://localhost:5006/writer/>
- Canvas：<http://localhost:5007/canvas/>

三个前端的 `/api` 请求都会代理到 API `http://127.0.0.1:5003`。

浏览器验收使用隔离端口，不会复用上面已经运行的开发进程：

```bash
bun run e2e
```

默认启动测试 API `5103`、Studio `5102`、Canvas `5107`，并从
`deploy/env/.env.test` 所指向的 PostgreSQL 实例创建本次运行独享的临时数据库，
测试结束后自动删除。如由外部编排器提供服务，可设置 `E2E_API_ORIGIN`、
`E2E_WEB_ORIGIN`、`E2E_CANVAS_ORIGIN`；只有明确设置
`E2E_REUSE_EXISTING_SERVER=true` 时才会跳过临时库并复用已有进程（此模式要求
外部 API 已连接同一个测试库）。

> API 由 Bun 运行时启动（Elysia 原生效能路径）；Worker、脚本、db 工具、测试仍走 Node（`node --import tsx`）。

### Windows 首次运行

要求：Node 24.12.x、Bun 1.4.x、Docker Desktop。先确认 `docker info`
可以访问 Linux engine，再执行上面的安装和数据库命令。测试/verify/db 命令已使用
跨平台进程调用，不需要 Git Bash。

开发数据库使用 named volume，普通 `bun run db:down` 会保留数据；只有明确需要重置
时才执行：

```powershell
docker compose -f deploy/docker/compose.yaml down -v
```

本地生产形态演练需要 Linux 版 ffmpeg/ffprobe，Windows 宿主机的 `.exe` 不能直接挂进
Linux 容器。准备一次：

```powershell
bun run fetch:static-ffmpeg:windows
bun run deploy:rehearsal:up
```

生产发布脚本仍依赖 Linux Bash、rsync 和远程 Linux 命令；Windows 上请在 WSL/Linux
环境执行，或使用 Linux CI，不要在普通 PowerShell 中直接运行 `deploy:prod`。

## 常用命令

```bash
bun run lint             # Biome lint（TS/TSX/JS，跨平台）
bun run typecheck        # 全仓 typecheck（tsc --noEmit）
bun run typecheck:root   # 根 scripts + tests 的 typecheck
bun run test             # 根契约测试 + 全仓 vitest（串行，共享 test DB）
bun run test:coverage    # 覆盖率
bun run verify           # migrations + boundaries + manifests + lint + typecheck + test
bun run check:boundaries # 包边界（import 规则）
bun run check:workspace-deps # workspace 内部依赖必须在各自 manifest 显式声明
bun run check:manifests  # 模型 manifest 一致性
bun run model:acceptance # 所有 enabled 模型的离线请求/响应矩阵
bun run model:acceptance -- --live=<model-id> # 单模型真实供应商 canary（需 DASHSCOPE_API_KEY）
bun run db:studio        # drizzle-kit studio
bun run e2e              # Playwright（需 test DB）
```

rehearsal 默认使用 Web `5012`、API `5013`、Postgres `55433`；可用 `BL_STUDIO_REHEARSAL_*_PORT` 覆盖。若运行 `deploy:rehearsal:smoke`，同步设置 `REHEARSAL_API_ORIGIN` 和 `REHEARSAL_WEB_ORIGIN`。

## 架构

```text
Studio (apps/studio, /)   Writer (apps/writer, /writer)   Canvas (apps/canvas, /canvas)   Admin (apps/admin, /admin)
              │                    @bailian-studio/api-client（zod 契约层）                 │
              └───────────────────────────────┬───────────────────────────────────────────┘
                                              ▼
        apps/api (Elysia, :5003, 由 Bun 启动)
              │ Postgres repository + generation_events outbox + NOTIFY
              ▼
        apps/worker (任务认领 FOR UPDATE SKIP LOCKED → DashScope → 产物持久化)
              │
        packages/（shared / model-core / sse-protocol / db / generation-repository /
                  auth / storage / provider-dashscope / task-engine /
                  credit-ledger / media-repository / persistence-runtime /
                  api-client / design-tokens）
```

- **包边界即架构**：`check:boundaries` 用正则强制执行「谁可以 import 谁」；`provider-dashscope` 是唯一受边界约束的执行包（只被 worker 消费），`model-core` 是前后端共享的 provider-neutral 契约 + 纯函数叶子，DashScope 目录由独立 manifest 包拥有。
- **manifest 驱动模型**：`packages/dashscope-manifests/src/manifests/` 是 DashScope 唯一数据源（含 transport/rules/pricing/parameters），新增模型 = 加一份 manifest + 注册表一行，provider/前端零代码扩展；web 表单用 `validateModelParams` 做提交前实时校验，与服务端等价。
- **SSE 实时管线**：生成事件以 DB outbox 为事实来源，携带 recordId 作「失效提示」；导演实体审核另发 `director.entities.changed` 实时失效提示（不进入 outbox），前端都只重新查询，不直接写入 SSE payload。
- **导演逐镜导出**：视频阶段只对当前有效的 `shot_video` 提供逐镜下载，复用用户资产下载 URL；不会把历史视频误当当前版本，也不替代可选的成片合成。
- **进程资源生命周期**：API/Worker 各自只创建一个共享 PostgreSQL/Drizzle 句柄，repository 与认证/积分服务通过注入复用；`LISTEN/NOTIFY` 监听器保留独立长连接。
- **前端状态**：TanStack Query 管理服务端数据，zustand 管理登录态和少量客户端状态；纯函数业务层负责参数投影、提示词引用转换和幂等指纹，页面不直接 fetch。

## 前端目录速览

```text
apps/studio/      主创作工作区：生成、素材库、画廊、提示词库、生成记录与导演项目
apps/writer/      剧本台：剧本编辑、导演入口和剧本格式化
apps/canvas/      节点式生成画布：素材节点、引用连线和手动生成
apps/admin/       管理后台：用户、任务、统计、反馈与画廊管理
packages/app-shell/  认证页、路由守卫、登录态与共享应用壳
packages/lib-client/ API 单例、Query 客户端、错误提示和公共客户端工具
packages/ui/         跨 app 复用的 UI 原语
```

`apps/admin` 是精简的管理后台（共享 `packages/ui` / `packages/lib-client` / `api-client`），
同源 `/admin` 挂载（nginx 反代，无需新域名/新证书）：`/login`、`/users`（用户列表，
含多选批量封禁/解封/赠送/删除）、`/users/:id`（详情/积分/资产）、`/stats`（调用统计）、
`/analytics`（成本毛利 + 留存漏斗）、`/feedback`（反馈管理）。路由守卫要求 `role === 'admin'`。

## 测试策略

- **后端包**：vitest（node 环境），覆盖状态机、仓储、provider、路由契约。
- **前端**：vitest + happy-dom，只测**纯函数层**（参数投影、引用转换、幂等、错误本地化）——不测 UI/样式（样式后续还会调整）。
- **根契约**：`tests/` + `scripts/**/*.test.ts`（包边界、manifest、Docker 清单）。

## 部署

单机 Docker Compose + **宿主机 nginx + certbot** 自动 HTTPS（Let's Encrypt；本仓库不内置 Caddy），日志经 Loki + Alloy + Grafana 集中可查（`logs.yxswy.com`）。生产镜像见 `deploy/docker/Dockerfile`（oven/bun 基座 + Node 24；API 用 bun 运行时，Worker 用 Node/tsx），生产配置统一在 `deploy/env/.env.prod`（gitignored），基础模板为 `deploy/env/.env.example`。发布前运行 `bun run verify`，然后 `bun run deploy:prod` 一键部署；只改前端时用 `bun run deploy:prod:web` 走前端镜像快速发版（约 20MB，不动 api/worker）。新库首次部署后需一次性播种模型成本：`bun run db:seed:model-costs`（生产用 `docker compose run --rm migrate bunx tsx scripts/db/seed-model-costs.ts`）。完整运维手册见 `docs/03-ops.md`，部署踩坑清单见 `docs/04-deployment-playbook.md`。
