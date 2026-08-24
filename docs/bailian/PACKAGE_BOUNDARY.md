# 模型知识边界规范（PACKAGE_BOUNDARY）

> 本文件是模型知识归属与包边界的**唯一规范**。`infra/scripts/check-package-boundaries.ts`（`pnpm run check:boundaries`，进 `verify`）是它的可执行版本：**改包边界必须先改这里，再同步脚本与对应测试。** 各 owner 包与相关路由的 AGENTS.md 均指向本文件。
>
> **背景**：bailian-hub 与外部 SDK（`@puzzle-fuzzy/bailian-sdk`）已并入本仓库。模型知识（transport / rules / pricing / parameters）全部收进 `@bailian-studio/model-core` 的 manifest，校验统一为纯函数。**git 即版本**——不再有 npm 发布、精确版本钉死或 coverage hash 对账仪式。

## 1. 执行层包的所有者与消费者白名单

| 包 | 所有者（唯一） | 允许消费者 | 依赖协议 |
|---|---|---|---|
| `@bailian-studio/provider-dashscope` | `packages/provider-dashscope` | `apps/worker` | `workspace:*` |

- 消费者只允许从包的 **package root export**（`src/index.ts`）import；禁止 subpath、禁止 deep-import 任意 `packages/<owner>/src/*` 源码目录。
- 新增消费者必须经过架构评审，并**同时**更新本文件、`check-package-boundaries.ts` 的 `bailianPackageBoundaries` 与对应测试。
- **`@bailian-studio/model-core` 不在此表**：它是被前后端共享的纯数据 + 纯函数叶子（唯一数据源），允许 `apps/web`（提交前实时校验）与 `apps/worker` / `generation-repository` / `api` / `provider-dashscope` 消费，不受消费者白名单限制（仅受第 2 节 import 禁令约束）。

## 2. 各包 import 禁令（check-package-boundaries.ts 的 rules 表）

`packages/api-client` 是传输契约层，允许依赖 `@bailian-studio/shared` 与 `zod`；它不得依赖执行层、数据库、应用层或其他运行时包。共享契约只保留一份，避免 API、Worker 与前端各自维护不同的 wire schema。

| 包 | 禁止 import |
|---|---|
| `packages/shared` | 任何其它 `@bailian-studio/*`（叶子包） |
| `packages/model-core` | `@bailian-studio/(db\|storage\|provider-dashscope)`、apps、services |
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

> 上表是**最小必须**：即使某包未被上表禁止，任何跨包 import 仍需符合第 1 节的消费者白名单与「package root export」约束。`apps/web` / `apps/admin` 未出现在上表，意味着它们只受第 1 节约束（即：可自由消费 model-core / api-client 等，禁止 deep-import 执行层源码）。

## 3. Owner 包职责边界

### packages/model-core（唯一数据源 + 纯函数校验层）
- **拥有**：51 份 model manifest（39 启用 / 12 个 vidu 暂未开通；parameters / rules / transport / pricing / output / request bindings / availability）与纯函数校验/定价/状态分类（`validateModelParams`、`estimateModelCost`、`classifyTaskStatus`、`assertResponseShape`、`ModelCoreError`）。
- **禁止**：import SDK / adapter / provider-dashscope；加 HTTP 客户端、环境访问、数据库代码、运行时编排、第二份契约/价格表。
- **可用性语义（`availability`）**：`MODEL_REGISTRY` 含全部 manifest；`listModels()` / `getModelById()` 只返回 `enabled: true`；`listModelCatalogItems()` 投影全部（含禁用项，前端置灰展示）。`availability.notActivated`（如 vidu 全家「暂未开通」）标注「key 已授权但产品卡未开通」的模型，必须配 `enabled: false`（registry-check 断言）且不能为空串。
- 每个注册的 manifest 必须在 Bailian operation requirement map 中**恰好出现一次**（含暂未开通的禁用模型——其能力仍投影进 catalog）；未知/退役产品参数必须校验失败，绝不静默丢弃。
- 改模型知识 = 改 manifest（transport/rules/pricing/availability 与参数同步更新），跑 `pnpm run check:manifests`。

### packages/provider-dashscope（协议执行层，worker 专属）
- **拥有**：传输目标解析（`resolveSubmit/Poll/CancelTarget` + 信任主机）、请求构造、HTTP submit/poll/chat 执行、provider 响应解析与错误分类。
- 只经 package root import model-core；禁止 SDK、DB/仓储/task-engine/event-bus/API/Worker/apps/elysia/react。
- 传输层保持可注入以便测试；**绝不向未通过信任校验的 URL 发送凭据**。

### packages/generation-repository（持久化接缝）
- **拥有**：持久化事务、任务/记录状态迁移、幂等、存储成本快照。
- 成本估算/结算只 import model-core 的纯函数（`estimateModelCost` / `calculateUsageCostCents`）；禁止 provider-dashscope、DashScope HTTP、解析 provider 端点、维护第二份契约/价格表。

## 4. 运行时应用

### apps/api
- 禁止 `@bailian-studio/db`、`@bailian-studio/provider-dashscope`、deep-import provider 源码、import worker sibling / apps。
- 持久化必须走 repository/auth 包的 URL 工厂，不直接碰 Drizzle。
- 模型目录 `/models/catalog` 与 `/models/:id` 直接投影 `model-core` 的 catalog（`listModelCatalogItems`），不在路由里重建模型元数据。

### apps/worker
- 禁止 `@bailian-studio/api`、`@bailian-studio/db`、import api sibling / apps、字面 DashScope HTTP 调用。
- DashScope 执行一律经 `@bailian-studio/provider-dashscope`；任务 handler 只消费归一化 `ProviderRunner` 结果，不直接理解 provider 请求/响应 schema。

### apps/web / apps/admin
- 可 import `@bailian-studio/model-core`（表单提交前实时校验）与 `@bailian-studio/api-client`（线缆契约）；禁止 deep-import 执行层源码。
- web 提交 payload 与校验入参由 `apps/web/src/lib/generation-submit.ts` 的 `buildSubmitPayload` / `buildValidationParams` 构造，与服务端 `prepareGenerationParams` 等价。

## 5. 变更与验证流程

1. 改边界（新增消费者 / 改禁令 / 改 ownership）→ 先改本文件 → 再改 `check-package-boundaries.ts` 与对应边界测试。
2. 改模型知识（manifest）→ 改 manifest 数据 + `check:manifests` 断言 → 必要时补 model-core 纯函数测试。
3. 验证：`pnpm run check:boundaries`、`pnpm run typecheck`、涉及包的单测、`pnpm run verify` 全绿。
