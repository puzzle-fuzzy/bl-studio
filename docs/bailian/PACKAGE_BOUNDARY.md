# Bailian SDK 包边界规范（PACKAGE_BOUNDARY）

> 本文件是 `@puzzle-fuzzy/bailian-sdk` 集成边界的**唯一规范**。`infra/scripts/check-package-boundaries.ts`（`pnpm run check:boundaries`，进 `verify`）是它的可执行版本：**改包边界必须先改这里，再同步脚本与对应测试。** 各 owner 包与相关路由的 AGENTS.md 均指向本文件。

## 1. 依赖所有权与消费者白名单

| 包 | 所有者（唯一） | 允许消费者 | 依赖协议 |
|---|---|---|---|
| `@puzzle-fuzzy/bailian-sdk` | `packages/bailian-adapter` | 无 | `catalog:`（精确版本只钉在根 `pnpm-workspace.yaml` catalog，coverage 基线绑定） |
| `@bailian-studio/bailian-adapter` | `packages/bailian-adapter` | `packages/provider-dashscope`、`packages/generation-repository`、`apps/api`、`apps/worker` | `workspace:*` |
| `@bailian-studio/provider-dashscope` | `packages/provider-dashscope` | `apps/worker` | `workspace:*` |

- 消费者只允许从包的 **package root export**（`src/index.ts`）import；禁止 subpath、禁止 deep-import 任意 `packages/<owner>/src/*` 源码目录。
- 新增消费者必须经过架构评审，并**同时**更新本文件、`check-package-boundaries.ts` 的 `bailianPackageBoundaries` 与对应测试。

## 2. 各包 import 禁令（check-package-boundaries.ts 的 rules 表）

| 包 | 禁止 import |
|---|---|
| `packages/shared` | 任何其它 `@bailian-studio/*`（叶子包） |
| `packages/model-core` | `@bailian-studio/(db\|storage\|provider-dashscope\|bailian-adapter)`、apps、services |
| `packages/bailian-adapter` | 除 `@bailian-studio/model-core` 外的一切 `@bailian-studio/*`、apps、services、elysia、react |
| `packages/provider-dashscope` | `@bailian-studio/(db\|storage\|generation-repository\|task-engine\|event-bus)`、apps、services、elysia、react |
| `packages/generation-repository` | `@bailian-studio/provider-dashscope`、services、apps、react、elysia |
| `packages/credit-ledger` | 除 `@bailian-studio/(db\|shared)` 外的一切 `@bailian-studio/*`、services、apps、react、elysia |
| `packages/media-repository` | `@bailian-studio/(provider-dashscope\|generation-repository\|model-core\|event-bus\|storage\|auth)`、services、apps、react、elysia |
| `packages/auth` | `@bailian-studio/(provider-dashscope\|generation-repository\|model-core\|task-engine\|event-bus\|storage)`、services、apps、react、elysia |
| `packages/db` | `@bailian-studio/(api\|worker\|task-engine\|event-bus\|model-core\|provider-dashscope)`、services、apps、react、elysia |
| `packages/task-engine` | `@bailian-studio/(db\|storage\|provider-dashscope)`、services、apps、react、elysia |
| `packages/event-bus` | `@bailian-studio/(db\|storage\|provider-dashscope)`、services、apps、react、elysia |
| `apps/api` | `@bailian-studio/(db\|provider-dashscope)`、importsApps、worker sibling、provider-dashscope package 路径 |
| `apps/worker` | `@bailian-studio/(api\|db)`、api sibling、importsApps、provider-dashscope package 路径、react、字面 DashScope HTTP 调用（`fetch`/`new Request` 指向 dashscope URL） |

> 上表是**最小必须**：即使某包未被上表禁止，任何跨包 import 仍需符合第 1 节的消费者白名单与「package root export」约束。

## 3. Owner 包职责边界

### packages/bailian-adapter（anti-corruption layer，唯一所有者）
- 唯一允许 import / 声明 `@puzzle-fuzzy/bailian-sdk` 的包。
- 只拥有：精确 SDK coverage 与不可变 baseline 元数据；SDK payload/request/response 校验的稳定包装；可信 endpoint 与任务生命周期归一化；官方定价查询/计算包装；暴露给运行时消费者的**只读契约快照**。
- 禁止：发起 HTTP 请求、读环境变量、持久化状态、调度重试、做产品流程决策；导出可变 SDK 对象或非稳定 SDK 实现类型。
- `maintenance: official-sync` 只能用 `pnpm run bailian:baseline:sync` 从**精确安装的 SDK** 生成 `BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE`，绝不手改 hash/计数/covered id；历史 `manual` lane 保留人工审批要求。

### packages/model-core（产品模型身份）
- 拥有：product model ID、capabilities、category、产品参数/默认值、provider model ID、执行模式要求、声明式 manifest bindings。
- 禁止：import SDK / adapter / provider-dashscope；加 HTTP 客户端、环境访问、数据库代码、运行时编排、官方 SDK 定价表。
- 每个启用的 manifest 必须在 Bailian operation requirement map 中**恰好出现一次**；未知/退役产品参数必须校验失败，绝不静默丢弃。

### packages/provider-dashscope（协议执行层）
- 拥有：请求构造、HTTP submit/poll/chat 执行、provider 响应解析、provider 错误分类。
- 只经 package root import adapter 与 model-core；禁止 SDK、deep-import adapter 源码、DB/仓储/task-engine/event-bus/API/Worker/apps/elysia/react。
- 传输层保持可注入以便测试；**绝不向未通过 adapter target 校验的 URL 发送凭据**。

### packages/generation-repository（持久化接缝）
- 拥有：持久化事务、任务/记录状态迁移、幂等、存储成本快照。
- 对 adapter 的使用刻意收窄：只取价格估算/计算结果与用于映射校验失败的稳定错误；禁止 SDK、provider-dashscope、DashScope HTTP、解析 provider 端点、维护第二份契约/价格表。

## 4. 运行时应用

### apps/api
- 禁止 `@bailian-studio/db`、`@bailian-studio/provider-dashscope`、deep-import provider 源码、import worker sibling / apps。
- 持久化必须走 repository/auth 包的 URL 工厂，不直接碰 Drizzle。

### apps/worker
- 禁止 `@bailian-studio/api`、`@bailian-studio/db`、import api sibling / apps、字面 DashScope HTTP 调用。
- DashScope 执行一律经 `@bailian-studio/provider-dashscope`；任务 handler 只消费归一化 `ProviderRunner` 结果，不理解 SDK payload/响应 schema。

## 5. 变更与验证流程

1. 改边界（新增消费者 / 改禁令 / 改 ownership）→ 先改本文件 → 再改 `check-package-boundaries.ts` 与对应边界测试。
2. 验证：`pnpm run check:boundaries`、`pnpm run typecheck`、涉及包的单测、`pnpm run verify` 全绿。
