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
pnpm run typecheck        # 全仓 tsc --noEmit（这就是 lint；无 ESLint）
pnpm run test             # 根契约测试 + 全仓 vitest（串行，共享 test DB）
pnpm run verify           # baseline + boundaries + manifests + typecheck + test
pnpm run check:boundaries # 包边界
pnpm run check:manifests  # manifest 一致性
pnpm run db:push / db:push:test
```

生产部署/日志/备份见 `docs/03-ops.md`：`pnpm run deploy:prod` 一键发布
（构建 SHA 镜像 → rsync → docker load → 迁移 → 滚动 up → 冒烟）；日志栈
Loki + Alloy + Grafana 挂在 `logs.yxswy.com`。`pnpm run check:production-env:infra`
校验基础设施 env（`.env.prod-infra`）。

测试环境：dev DB `:55431`（bailian-studio_dev），test DB `:55432`（bailian-studio_test）。改 schema 后 `db:push` + `db:push:test`。

## 架构与边界

包边界是**可执行的架构**（`infra/scripts/check-package-boundaries.ts`，进 `verify`）：

- 运行时应用**禁止**直接 import `@bailian-studio/db`——持久化走 repository/auth 包的 URL 工厂。
- `apps/api` 与 `apps/worker` **禁止互相 import**。
- `@bailian-studio/bailian-adapter` 是 `@puzzle-fuzzy/bailian-sdk` 的**唯一所有者**；provider/repository/apps 只能消费 adapter。
- SDK 版本在 `pnpm-workspace.yaml` 的 `catalog:` 钉死精确版本（coverage 基线绑定）。
- `@bailian-studio/shared` 是叶子包，不得 import 其它 `@bailian-studio/*`。

改跨包 import 后必须 `pnpm run check:boundaries`。

### 包一览

| 包 | 职责 |
|---|---|
| shared | 叶子：logger（敏感 key 脱敏）、metrics、错误基类、进程原语（spawn/sleep） |
| model-core | manifest 驱动模型注册表（45 个模型，深冻结） |
| event-bus | SSE 事件类型与 `encodeSSE` |
| db | Drizzle schema + outbox NOTIFY 触发器 |
| generation-repository | 生成记录/任务/产物/事件的持久化接缝（`FOR UPDATE SKIP LOCKED`） |
| auth | argon2id 密码 + JWT 会话（http-only cookie） |
| storage | local/OSS 存储适配器 |
| provider-dashscope | DashScope 协议执行（仅 worker 消费） |
| task-engine | 纯任务状态机 + 退避 |
| bailian-adapter | 外部 SDK 唯一入口（coverage 基线） |
| credit-ledger | 积分账本（冻结/结算/释放） |
| api-client | 前端共享的 zod 契约层（零 `as`） |
| design-tokens | CSS 设计令牌 |

## 前端约定（apps/web）

- **状态**：zustand store（`src/stores/`），登录态登出时统一 `resetPrivateData()`（注册表机制）。
- **SSE 只做失效**：`use-generation-events` 收到事件只 `refreshRecord(id)` + 失效资产缓存，不写数据。
- **纯函数层**（`src/lib/`）可单测：参数投影、提示词引用转换、幂等指纹、错误本地化。
- **UI 组件**一律用 shadcn/ui（`src/components/ui/`，60+ 组件）；样式用 Tailwind v4。
- **不要写 UI/样式测试**——页面样式后续还会调整。前端测试只覆盖纯函数层（vitest + happy-dom）。
- 动态参数表单用「索引 token」承载非 string 枚举值（Radix Select 限制）。
- 提示词参考图：编辑态 `@图N` 中性标记 ↔ 提交时按模型 `referenceFormat` 转 provider 语法。

## 测试约定

- 后端包测试放 `tests/`（与 `src/` 同级），vitest。曾经是 `bun:test`，已全部迁移。
- 根测试 `tests/` + `infra/scripts/*.test.ts` 由 `pnpm run test:root` 跑。
- 改代码后跑 `pnpm run typecheck` + 对应包测试 + `pnpm run check:boundaries`。

## 运行时迁移备忘（Bun → Node，除了 API）

- `Bun.password` → `@node-rs/argon2`（`packages/auth/src/password.ts`，ARGON2ID=2 是字面值，别改回 const enum——TS7 + verbatimModuleSyntax 不允许）。
- `Bun.spawn` / `Bun.sleep` / `Bun.spawnSync` → `@bailian-studio/shared` 的 `spawnProcess` / `sleep` / `spawnSyncResult`。
- `import.meta.dir` → `fileURLToPath(new URL('.', import.meta.url))`。
- 204 响应必须 `return new Response(null, { status: 204 })`，不能 `set.status = 204` 后隐式返回——Node 的 undici 对 204+body 会抛错（Bun 容忍，Node 不）。
