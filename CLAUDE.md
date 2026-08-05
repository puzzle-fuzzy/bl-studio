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

### apps/admin（管理后台，同源 /admin）

- 与 web 同技术栈（shadcn/ui + zustand + api-client），**同源 `/admin` 挂载**（web 容器 nginx 反代，无需新域名/证书/跨域）。
- 页面：`/login`、`/`（用户列表：分页/搜索/角色/软删）、`/users/:id`（详情/积分赠送/资产）、`/stats`（调用统计）。
- 路由守卫：restore 后非 `role === 'admin'` → 403 页；未登录 → `/login`。API 侧一律 `requireAdminUser()`。
- 复用 `apps/web` 的 shadcn 组件时注意：两 app 的 `components/ui/` 各自独立，新增组件两边都要有（或按需拷贝）。

## 测试约定

- 后端包测试放 `tests/`（与 `src/` 同级），vitest。曾经是 `bun:test`，已全部迁移。
- 根测试 `tests/` + `infra/scripts/*.test.ts` 由 `pnpm run test:root` 跑。
- 改代码后跑 `pnpm run typecheck` + 对应包测试 + `pnpm run check:boundaries`。

## 运行时迁移备忘（Bun → Node，除了 API）

- `Bun.password` → `@node-rs/argon2`（`packages/auth/src/password.ts`，ARGON2ID=2 是字面值，别改回 const enum——TS7 + verbatimModuleSyntax 不允许）。
- `Bun.spawn` / `Bun.sleep` / `Bun.spawnSync` → `@bailian-studio/shared` 的 `spawnProcess` / `sleep` / `spawnSyncResult`。
- `import.meta.dir` → `fileURLToPath(new URL('.', import.meta.url))`。
- 204 响应必须 `return new Response(null, { status: 204 })`，不能 `set.status = 204` 后隐式返回——Node 的 undici 对 204+body 会抛错（Bun 容忍，Node 不）。
