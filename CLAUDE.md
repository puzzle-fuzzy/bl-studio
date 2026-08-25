# CLAUDE.md

面向 Claude Code（或任何 AI 助手）在本仓库工作时需要知道的约定。

## 这是什么

AI 媒体生成平台（文生图/文生视频等），由原 bailian-studio（Vue+React 双前端）与 bailian-hub（模型书架）合并重写。核心架构：Elysia API + Postgres 任务队列 + 独立 Worker 执行 DashScope + SSE 实时推送。

**最重要的运行时约定（容易搞错，务必遵守）：**

> - **包管理 / 任务编排：pnpm + turbo**。一切安装、脚本、测试都走 pnpm。
> - **唯一例外：Elysia API 进程用 Bun 启动**（`bun apps/api/src/index.ts`）。Elysia 在 Bun 下走原生 `Bun.serve`；在 Node 下会退回不支持的 WebStandard adapter，`app.listen` 会报错。
> - **Worker 用 Node + tsx 启动**（`tsx apps/worker/src/index.ts`）。
> - Node 版本 ≥ 24（`import.meta.main` 是原生特性，不要再引入运行时探测 helper）。

## 常用命令

```bash
pnpm install
pnpm run dev              # turbo 并行：api(bun,5003) / worker(tsx) / web(vite,5002)
pnpm run lint             # Biome lint（TS/TSX/JS，跨平台）
pnpm run typecheck        # 各包 tsc --noEmit（turbo 并行）
pnpm run typecheck:root   # 根作用域 tsc --noEmit：scripts/ + 根 tests/（per-package typecheck 不含这两处）
pnpm run test             # 根契约测试 + 全仓 vitest（串行，共享 test DB）
pnpm run verify           # check:db-migrations + boundaries + manifests + lint + typecheck + test
pnpm run check:boundaries # 包边界
pnpm run check:manifests  # manifest 一致性
pnpm run model:acceptance # 所有 enabled 模型的离线请求/响应矩阵
pnpm run model:acceptance -- --live=<model-id> # 单模型真实供应商 canary（需 DASHSCOPE_API_KEY）
pnpm run check:db-migrations # schema↔迁移链对账（drizzle-kit generate 离线比较；见 scripts/verify/check-db-migrations.ts）
# db:push / db:push:test 仅一次性或明确允许重算的临时库使用（按 schema.ts 现算 diff 直写 dev/test 库；
# 脚本通过 dotenv-cli 注入连接串，兼容 Windows，不要在命令行内联 DATABASE_URL）：
# 新库初始化和持续升级统一走 `db:migrate` / `db:migrate:test`，避免复合外键与唯一约束的建表顺序差异。
# 改了 schema.ts 后正式流程是 `pnpm exec drizzle-kit generate --config packages/db/drizzle.config.ts` 提交迁移，
# 生产/CI 一律走 `db:migrate`（db:migrate:test / db:migrate:production）——push 掩盖漂移正是 P0-06 要堵的。
```

Windows 开发使用 PowerShell 即可运行安装、数据库、typecheck 和测试命令；生产
`deploy:*`、备份与观测脚本仍要求 Linux/WSL（Bash、rsync、Linux 远程命令）。

## 生产部署（做部署前必读）

**先读 `docs/04-deployment-playbook.md`（部署手册：正确流程 + 踩坑清单）和 `docs/03-ops.md`（运维：日志/备份/回滚/故障排查）。** 一键发布：`pnpm run verify && pnpm run deploy:prod`。日志栈 Loki + Alloy + Grafana 挂在 `logs.yxswy.com`（观测栈在 `observability` profile，`pnpm run prod:observability:up` 启用）。

**生产环境的关键事实（易踩坑，务必先知道）：**
- 服务器是**共享机**（SSH 别名 `yxswy-server` = root@101.35.246.159），同时跑着多个其它服务。
- **HTTPS 边缘 = 宿主机 nginx + certbot**（80/443 被独占），**不是 Caddy**。站点配置在 `/etc/nginx/conf.d/*.yxswy.com.conf`，反代到 127.0.0.1:5002（web）/5300（grafana）。
- 本机 **arm64 → 服务器 x86_64**：构建必须 `--platform linux/amd64`（deploy 脚本已处理）。
- 本机 **Clash fake-ip 劫持 DNS**：本地 `dig` 不可信，查 DNS 要在服务器上 `getent hosts`。
- 两个域名共用一份 Let's Encrypt SAN 证书（在 `live/create.yxswy.com/`），logs 站点引用同一路径。
- 运行时用户是 `bun`（无 node 用户）；镜像内 Node ≥24（apt 的 v20 会让 worker 静默退出）。
- 安全红线：`.env.production` / `.env.prod-infra` gitignored，**绝不打印/提交任何凭据值**。

测试环境：dev DB `:55431`（bailian-studio_dev），test DB `:55432`（bailian-studio_test）。改 schema 后生成迁移并执行 `db:migrate` / `db:migrate:test`。

社区化特性（封禁/画廊/提示词库/反馈/成本分析）设计见 `docs/05-community-features.md`。其中**审计动作新增必须在三处同步**：`packages/generation-repository/src/audit-types.ts`、`packages/db/src/schema.ts` 的 `audit_logs_action_check`、`scripts/db/ensure-audit-action-constraint.ts`；drizzle 检测不到已命名 CHECK 表达式变更，迁移里要**手工 DROP/ADD** 该约束。

## 架构与边界

包边界是**可执行的架构**（`scripts/verify/check-package-boundaries.ts`，进 `verify`）：

- **`@bailian-studio/model-core` 是唯一数据源**：51 份 manifest（39 启用 / 12 个 vidu 暂未开通；transport/rules/pricing/parameters/availability 全在 manifest 里）+ 纯函数校验层（`validateModelParams` / `estimateModelCost` / `classifyTaskStatus` / `assertResponseShape`），前后端共享。**改模型知识 = 改 manifest，git 即版本**——没有外部 SDK、npm 发布或 hash 对账仪式。
- **模型可用性语义（`availability`）**：`MODEL_REGISTRY` 含全部 manifest；`listModels()` / `getModelById()` 只返回 `enabled: true`。`notActivated`（如 vidu 全家「暂未开通」——key 已授权但百炼产品卡未开通）必须配 `enabled: false`（registry-check 断言），模型仍投影进前端 catalog 置灰 + 打 tag，但提交/worker 解析经 `getModelById` 一律拒绝。
- `@bailian-studio/provider-dashscope` 是唯一受边界约束的执行包：**只允许 `apps/worker` 消费**（协议 `workspace:*`）；它是 worker 专属的 DashScope 传输/执行层。
- **`apps/web` 可以直接 import model-core** 做提交前实时校验（提交 payload 与 `apps/web/src/lib/generation-submit.ts` 的 `buildValidationParams` 保持一致）。
- 运行时应用**禁止**直接 import `@bailian-studio/db`——持久化走 repository/auth 包的 URL 工厂。
- `apps/api` 与 `apps/worker` **禁止互相 import**。
- `@bailian-studio/shared` 只允许依赖 `@bailian-studio/creative-asset-contracts` 作为领域协议叶子；不得依赖数据库、Provider 或运行时应用。

改跨包 import 后必须 `pnpm run check:boundaries`。

### 包一览

| 包 | 职责 |
|---|---|
| shared | 通用基础：logger（敏感 key 脱敏）、metrics、错误基类、运行时校验；仅依赖 creative-asset-contracts |
| model-core | **唯一数据源**：51 个 manifest（39 启用 / 12 个 vidu 暂未开通；深冻结）+ 纯函数校验/定价/状态分类（前后端共享） |
| event-bus | SSE 事件类型与 `encodeSSE` |
| db | Drizzle schema + outbox NOTIFY 触发器 |
| generation-repository | 生成记录/任务/产物/事件的持久化接缝（`FOR UPDATE SKIP LOCKED`） |
| media-repository | 媒体作业（提取音频/首帧等）持久化与派生产物 |
| auth | argon2id 密码 + JWT 会话（http-only cookie） |
| storage | local/OSS 存储适配器 |
| provider-dashscope | DashScope 协议执行（仅 worker 消费） |
| task-engine | 纯任务状态机 + 退避 |
| credit-ledger | 积分账本（冻结/结算/释放） |
| api-client | 前端共享的 zod 传输契约层（零 `as`），创意资产协议直接依赖 contracts |
| design-tokens | CSS 设计令牌 |

## 模型知识维护工作流

模型知识（transport / rules / pricing / parameters / availability）只存在 `packages/model-core/src/manifests/`。改模型的流程：

1. **官网变更** → 运行 `pnpm run sync:bailian-docs` 看漂移报告（兼容面有机器清单；媒体生成面与定价没有，需人工比对官网文档）；
2. **AI 读官网原文** → 更新对应 manifest（参数约束 / 传输端点 / 定价 rates / rules），保证 `pnpm run check:manifests` 通过；
3. `pnpm run verify` 全绿 → `pnpm run deploy:prod` 部署。

**git 即版本**：没有外部 SDK、npm 发布或 hash 对账，改了 manifest 就是新版本。

> **暂未开通模型**（当前 = vidu 全家 12 个）：key 里授权了但百炼产品卡没开通时，**不要删 manifest**，而是置
> `availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' }`——仍进前端 catalog 置灰展示（带 tag），
> 但 `listModels` / 提交 / worker 解析一律排除。产品卡开通后改回 `enabled: true` 即上线。

## 前端约定（apps/web）

- **状态**：zustand store（`src/stores/`），登录态登出时统一 `resetPrivateData()`（注册表机制）。
- **SSE 只做失效**：`use-generation-events` 收到事件只 `refreshRecord(id)` + 失效资产缓存，不写数据。
- **纯函数层**（`src/lib/`）可单测：参数投影（`parameter-form-schema` / `parameter-validation`）、级联子模式（`model-modes`，含「暂未开通」置灰）、提示词引用转换（`reference-format`）、幂等指纹（`idempotency`）、失败详情（`generation-failure`）、分块恢复（`chunk-recovery`）、错误本地化（`user-error`）。
- **UI 组件**一律用 shadcn/ui（`src/components/ui/`，60+ 组件）；样式用 Tailwind v4。
- **不要写 UI/样式测试**——页面样式后续还会调整。前端测试只覆盖纯函数层（vitest + happy-dom）。
- 动态参数表单用「索引 token」承载非 string 枚举值（Radix Select 限制）。
- 提示词参考图：编辑态 `@图N` 中性标记 ↔ 提交时按模型 `referenceFormat` 转 provider 语法。
- **模型级联选择器**（`ModelSelector`）：子模式由选中模型 capabilities 派生（单一事实源），避免「选中即弹回」；browse 态用于「某子模式全部模型暂未开通」时停留展示置灰项（anchoredId 锚定，选中模型一变即回归派生值）——当前各子模式仍有 ≥1 个启用模型（r2v 由 happyhorse-reference-video 支撑），browse 是防御机制。

### apps/admin（管理后台，同源 /admin）

- 与 web 同技术栈（shadcn/ui + zustand + api-client），**同源 `/admin` 挂载**（web 容器 nginx 反代，无需新域名/证书/跨域）。
- 页面：`/login`、`/users`（用户列表：分页/搜索/角色/软删 + 多选批量封禁/解封/赠送/删除）、`/users/:id`（详情/积分赠送/资产）、`/stats`（调用统计）、`/analytics`（成本毛利 + 留存漏斗）、`/feedback`（反馈管理）。
- 路由守卫：restore 后非 `role === 'admin'` → 403 页；未登录 → `/login`。API 侧一律 `requireAdminUser()`。
- web 端社区入口：`/gallery`（社区画廊）、`/prompts`（提示词库）均为 ProtectedRoute 内页面。
- 复用 `apps/web` 的 shadcn 组件时注意：两 app 的 `components/ui/` 各自独立，新增组件两边都要有（或按需拷贝）。

## 测试约定

- 后端包测试放 `tests/`（与 `src/` 同级），vitest。曾经是 `bun:test`，已全部迁移。
- 根测试 `tests/` + `scripts/**/*.test.ts` 由 `pnpm run test:root` 跑。
- 改代码后跑 `pnpm run typecheck` + 对应包测试 + `pnpm run check:boundaries`。

## 运行时迁移备忘（Bun → Node，除了 API）

- `Bun.password` → `@node-rs/argon2`（`packages/auth/src/password.ts`，ARGON2ID=2 是字面值，别改回 const enum——TS7 + verbatimModuleSyntax 不允许）。
- `Bun.spawn` / `Bun.sleep` / `Bun.spawnSync` → `@bailian-studio/shared` 的 `spawnProcess` / `sleep` / `spawnSyncResult`。
- `import.meta.dir` → `fileURLToPath(new URL('.', import.meta.url))`。
- 204 响应必须 `return new Response(null, { status: 204 })`，不能 `set.status = 204` 后隐式返回——Node 的 undici 对 204+body 会抛错（Bun 容忍，Node 不）。
