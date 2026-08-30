# 模型知识边界规范（PACKAGE_BOUNDARY）

> 本文件是模型知识归属与包边界的**唯一规范**。`scripts/verify/check-package-boundaries.ts`（`bun run check:boundaries`，进 `verify`）是它的可执行版本：**改包边界必须先改这里，再同步脚本与对应测试。** 各 owner 包与相关路由的 AGENTS.md 均指向本文件。
>
> **背景**：bailian-hub 与外部 SDK（`@puzzle-fuzzy/bailian-sdk`）已并入本仓库。模型知识（transport / rules / pricing / parameters）由 provider 专属 manifest 包持有，provider-neutral 的契约与纯函数收进 `@bailian-studio/model-core`。**git 即版本**——不再有 npm 发布、精确版本钉死或 coverage hash 对账仪式。

## 1. 执行层包的所有者与消费者白名单

| 包 | 所有者（唯一） | 允许消费者 | 依赖协议 |
|---|---|---|---|
| `@bailian-studio/provider-dashscope` | `packages/provider-dashscope` | `apps/worker` | `workspace:*` |
| `@bailian-studio/persistence-runtime` | `packages/persistence-runtime` | `apps/api` / `apps/worker` | `workspace:*` |
| `@bailian-studio/task-repository` | `packages/task-repository` | `packages/generation-repository` / `packages/persistence-runtime` / `packages/media-repository` / `packages/director-repository` / `packages/admin-repository` / `apps/api` / `apps/worker` | `workspace:*` |
| `@bailian-studio/creative-asset-repository` | `packages/creative-asset-repository` | `apps/api` / `packages/persistence-runtime` / `packages/generation-repository` | `workspace:*` |
| `@bailian-studio/admin-repository` | `packages/admin-repository` | `apps/api` / `packages/persistence-runtime` / `packages/generation-repository`（仅仓储集成测试） | `workspace:*` |
| `@bailian-studio/canvas-execution` | `packages/canvas-execution` | `apps/api`、`apps/worker` | `workspace:*` |
| `@bailian-studio/dashscope-manifests` | `packages/dashscope-manifests` | `apps/api` / `apps/worker` / `packages/canvas-validation` / `packages/provider-dashscope` / `scripts`（`creative-asset-compiler` 仅测试 fixture） | `workspace:*` |

- 消费者只允许从包的 **package root export**（`src/index.ts`）import；禁止 subpath、禁止 deep-import 任意 `packages/<owner>/src/*` 源码目录。
- 新增消费者必须经过架构评审，并**同时**更新本文件、`check-package-boundaries.ts` 的 `bailianPackageBoundaries` 与对应测试。
- **`@bailian-studio/model-core` 不在此表**：它是被前后端共享的 provider-neutral 契约 + 纯函数叶子，允许前端和服务端按需消费，不受消费者白名单限制（仅受第 2 节 import 禁令约束）。具体 provider 目录必须通过对应的 manifest 包显式消费。
- **`@bailian-studio/canvas-validation` 不在执行层白名单表**：它是前后端共享的 Canvas 预检纯函数包，仅依赖 `canvas-contracts` 与 `model-core`，允许 `apps/canvas` 及服务端按需消费。它不负责资产 ownership、revision、任务入队或 provider 请求。

## 2. 各包 import 禁令（check-package-boundaries.ts 的 rules 表）

`packages/api-client` 是传输契约层，允许依赖 `@bailian-studio/shared`、
`@bailian-studio/creative-asset-contracts`、`@bailian-studio/canvas-contracts`、
`@bailian-studio/director-contracts` 与 `zod`；
它不得依赖执行层、数据库、应用层或其他运行时包。共享契约只保留一份，避免 API、
Worker 与前端各自维护不同的 wire schema。

| 包 | 禁止 import |
|---|---|
| `packages/shared` | 任何其它 `@bailian-studio/*`（叶子包） |
| `packages/director-contracts` | 任何其它 `@bailian-studio/*`、services、apps、react、elysia |
| `packages/model-core` | `@bailian-studio/(db\|storage\|provider-dashscope\|dashscope-manifests)`、apps、services |
| `packages/dashscope-manifests` | 除 `@bailian-studio/model-core` 外的其它 workspace 包、apps、services、elysia、react |
| `packages/provider-dashscope` | `@bailian-studio/(db\|storage\|generation-repository\|task-engine\|sse-protocol)`、apps、services、elysia、react |
| `packages/generation-repository` | `@bailian-studio/(provider-dashscope\|dashscope-manifests)`、直接从 `@bailian-studio/db` 导入创意资产域表、services、apps、react、elysia |
| `packages/admin-repository` | `@bailian-studio/(provider-dashscope\|api\|worker\|storage\|sse-protocol)`、services、apps、react、elysia |
| `packages/director-repository` | 除 `@bailian-studio/(db\|director-contracts\|task-repository)` 外的其它 `@bailian-studio/*`、services、apps、react、elysia |
| `packages/credit-ledger` | 除 `@bailian-studio/(db\|shared)` 外的一切 `@bailian-studio/*`、services、apps、react、elysia |
| `packages/media-repository` | `@bailian-studio/(provider-dashscope\|generation-repository\|model-core\|sse-protocol\|storage\|auth)`、services、apps、react、elysia |
| `packages/auth` | `@bailian-studio/(provider-dashscope\|generation-repository\|model-core\|task-engine\|sse-protocol\|storage)`、services、apps、react、elysia |
| `packages/db` | `@bailian-studio/(api\|worker\|task-engine\|sse-protocol\|model-core\|provider-dashscope)`、services、apps、react、elysia |
| `packages/task-engine` | `@bailian-studio/(db\|storage\|provider-dashscope)`、services、apps、react、elysia |
| `packages/task-repository` | 除 `@bailian-studio/(db\|task-engine)` 外的一切 `@bailian-studio/*`、services、apps、react、elysia |
| `packages/canvas-execution` | `@bailian-studio/(db\|storage\|provider-dashscope\|dashscope-manifests\|generation-repository\|task-repository\|task-engine\|api-client)`、services、apps、react、elysia |
| `packages/creative-asset-compiler` | `@bailian-studio/dashscope-manifests`、services、apps、react、elysia |
| `packages/sse-protocol` | `@bailian-studio/(db\|storage\|provider-dashscope)`、services、apps、react、elysia |
| `packages/persistence-runtime` | services、apps、react、elysia；只负责进程级持久化资源组装 |
| `apps/api` | `@bailian-studio/(db\|provider-dashscope)`、importsApps、worker sibling、provider-dashscope package 路径 |
| `apps/worker` | `@bailian-studio/(api\|db)`、api sibling、importsApps、provider-dashscope package 路径、react、字面 DashScope HTTP 调用（`fetch`/`new Request` 指向 dashscope URL） |

> 上表是**最小必须**：即使某包未被上表禁止，任何跨包 import 仍需符合第 1 节的消费者白名单与「package root export」约束。四个前端 app 未出现在上表，意味着它们只受第 1 节约束（即：可自由消费 model-core / api-client 等，禁止 deep-import 执行层源码）。

## 3. Owner 包职责边界

### packages/model-core（provider-neutral 契约 + 纯函数校验层）
- **拥有**：`ModelManifest` 的通用形状、`NormalizedOutput/NormalizedArtifact` provider-neutral 输出契约、参数/计价校验与模型错误类型（`validateModelParams`、`estimateModelCost`、`ModelCoreError`）。
- **禁止**：import SDK / adapter / provider catalog；加 HTTP 客户端、环境访问、数据库代码、运行时编排、第二份契约/价格表。

### packages/dashscope-manifests（DashScope 模型知识 owner）
- **拥有**：51 份 DashScope/Bailian manifest（39 启用 / 12 个 vidu 暂未开通）、注册表深冻结、catalog 投影、Bailian operation requirement map、一致性门禁，以及 DashScope response/status 纯函数。
- **依赖方向**：只能依赖 `model-core`；不依赖 provider 执行器、数据库或应用。通用 manifest、`ModelParameterBinding` 及 `readModelParameterBinding`、参数/计价/响应校验均由本包拥有；具体 provider 的 request/output/transport mapping types 由对应 manifest 包拥有。
- **可用性语义**：`MODEL_REGISTRY` 含全部 manifest；`listModels()` / `getModelById()` 只返回 `enabled: true`；`listModelCatalogItems()` 投影全部（含禁用项，前端置灰展示）。
- 改模型知识 = 改此包的 manifest，跑 `bun run check:manifests`。

### packages/provider-dashscope（协议执行层，worker 专属）
- **拥有**：传输目标解析（`resolveSubmit/Poll/CancelTarget` + 信任主机）、请求构造、HTTP submit/poll/chat 执行、DashScope 响应解析与错误分类；解析结果实现 `model-core` 的 `NormalizedOutput` 契约。
- 只经 package root import model-core；禁止 SDK、DB/仓储/task-engine/sse-protocol/API/Worker/apps/elysia/react。
- 传输层保持可注入以便测试；**绝不向未通过信任校验的 URL 发送凭据**。

### packages/generation-repository（持久化接缝）
- **拥有**：持久化事务、任务/记录状态迁移、幂等、存储成本快照。
- **模型依赖**：通过 `src/model-port.ts` 的 `ModelManifestResolver` 注入模型目录；不直接依赖任何 provider catalog。
- **测试例外**：`src/test-utils.ts` 与 `tests/` 可在 `devDependencies` 中使用真实 DashScope
  catalog 作为 fixture；该例外不改变生产源码与运行时消费者白名单。
- gallery/social 已先通过 `src/social.ts` 暴露窄 `SocialRepository` port；API 组合根注入该 port，
  SQL 已物理归档在 `social.ts`，后续再迁移为独立 repository 包。
- 通知已通过 `src/notifications.ts` 暴露 `NotificationRepository` port；通知收件箱和 gallery
  的社交通知编排都通过 API 组合根注入。
- 提示词库、用户反馈、内容举报分别由 `src/prompt-library.ts`、`src/feedback.ts`、
  `src/content-reports.ts` 拥有 SQL 和窄 port；API 组合根分别注入，路由不再把这些能力
  绑定到 `GenerationRepository`。举报后的 admin 画廊下架仍是显式治理编排。
- admin gallery 治理由 `src/admin-gallery.ts` 的 `AdminGalleryRepository` 拥有；它允许
  后台预览隐藏作品，但不改变面向用户的 SocialRepository 可见性策略。
- admin 任务中心和成本/留存读模型分别由 `src/admin-tasks.ts` 的 `AdminTaskRepository`
  与 `src/analytics.ts` 的 `AnalyticsRepository` 拥有；内容域不再通过中央聚合转发。AdminTask
  是跨 users/generation/assets 的只读运营投影，已物理拆包进入独立
  `@bailian-studio/admin-repository`；它不迁入只负责任务生命周期的 task-repository。
- `GenerationRepository` 核心接口不再重复声明 gallery、通知、提示词库、反馈、举报、
  admin 与分析方法；URL 工厂/隔离测试句柄分别暴露核心 repository 与各域窄 port，仓储
  测试按窄 port 组合 harness。
- 资产与分享由显式窄 port 约束 API：`AssetRepository`、`ShareRepository`、
  `PublicShareRepository`；SQL 已分别归档在 `assets.ts`、`shares.ts`，旧
  `GenerationRepository` 核心接口不再暴露这些方法。
- API 审计通过 `src/audit-port.ts` 的 `AuditRepository` 注入；审计写入是横切能力，路由
  不应为了记录审计而依赖完整 `GenerationRepository`。具体 SQL 已物理归档到
  `src/audit-events.ts`；核心 generation repository 不再转发该能力。
- Worker 的 provider 出站请求审计通过 `src/provider-request-port.ts` 的
  `ProviderRequestAuditRepository` 注入，写入实现归档在 `provider-requests.ts`；
  `GenerationRepository` 只保留生成详情所需的 provider 请求投影，Worker 不再依赖
  生成核心接口上的审计写入方法。
- 生成详情诊断通过 `src/diagnostics.ts` 的 `GenerationDiagnosticsRepository` 注入；该 port
  只提供脱敏只读投影，核心 `GenerationRepository` 不再暴露诊断聚合方法。
- Worker 的陈旧 generation 恢复扫描通过 `src/recovery.ts` 的
  `GenerationRecoveryRepository` 注入；该 port 只读取恢复候选，最终状态收口仍由核心
  `GenerationRepository` 完成。
- 用户用量读模型由 `src/usage.ts` 的 `UsageRepository` 拥有；用量查询 SQL 与 generation
  生命周期写入分离，API 只获取当前用户的时间窗口聚合。生成应用服务也显式注入
  `UsageRepository` 做每日限额预检；`GenerationRepository` 核心接口不再包含用量读取，
  URL 工厂/隔离测试句柄改为直接暴露 `UsageRepository`。
- 成本估算/结算只 import model-core 的纯函数（`estimateModelCost` / `calculateUsageCostCents`）；禁止 provider-dashscope、DashScope HTTP、解析 provider 端点、维护第二份契约/价格表。

### packages/task-repository（任务生命周期持久化）
- **拥有**：`task_records` 的 claim、租约续期、状态保存、按 id 读取、业务事务内按关联记录/类型/状态筛选任务，以及 queued 任务取消；同时提供只读任务详情和终态记录 ID 投影；负责 Drizzle 行与 task-engine 领域记录之间的日期/JSON 映射。
- **不拥有**：状态机规则、业务记录 + 初始任务的复合生产事务、Provider 执行或 API 编排；状态转换由 `task-engine` 负责，生产事务暂由各业务 repository 保持原子性。
- Worker 只依赖这里的最小生命周期 port；generation-repository 不承担任务生命周期 port。

### packages/canvas-execution（Canvas 图编译器）
- **拥有**：Canvas 快照到执行计划的纯函数编译、DAG 环检测、节点模型/素材输入校验和
  provider-neutral 的参数/资产绑定；只依赖 `canvas-contracts` 与 `model-core`。
- **模型依赖**：通过 `model-core` 的 `ModelManifestResolver` 注入模型目录；Canvas 编译器不
  绑定任何具体 provider。
- **不拥有**：用户鉴权、资产 ownership 查询、任务入队、generation 状态推进、Provider
  请求和 read URL。API 在调用编译器前解析用户资产种类，Worker 只消费已固化的执行计划。
- 执行计划只保存稳定资产 ID，不保存签名 URL；这保证任务重试和版本历史不依赖过期地址。

### packages/canvas-validation（Canvas 提交前预检）
- **拥有**：前后端共享的图结构、模型参数、提示词和素材槽位预检，以及节点级、字段级错误投影。
- **不拥有**：用户鉴权、资产 ownership、revision、任务入队、generation 状态推进、Provider 请求和 read URL；服务端的 `canvas-execution` 编译与 API 权威校验仍是最终边界。

### packages/creative-asset-compiler（创意资产绑定编译器）
- **拥有**：已授权素材绑定到模型参数的 provider-neutral 编译、提示词引用归一化和不可变能力快照生成。
- **模型依赖**：只消费 model-core 的 `ModelParameterBinding` 与 manifest 基础契约，并在本包定义 `CreativeAssetCompilerManifest` 最小视图；provider-specific manifest 包只在测试中作为 fixture 使用。
- **不拥有**：资产 ownership/approved 查询、Provider HTTP 请求、数据库和具体 provider registry。

## 4. 运行时应用

### apps/api
- 禁止 `@bailian-studio/db`、`@bailian-studio/provider-dashscope`、deep-import provider 源码、import worker sibling / apps。
- 持久化通过 `@bailian-studio/persistence-runtime` 取得进程级共享句柄；API 不直接碰 Drizzle，URL 工厂仅用于独立包测试或单模块工具。
- 模型目录 `/models/catalog` 与 `/models/:id` 只消费组合根注入的 `modelCatalog` port，不在路由里重建模型元数据；当前默认实现来自 `dashscope-manifests`。
- 生成与导演应用服务通过组合根注入 `modelResolver`，导演能力判断同时消费注入的 `modelCatalog`；服务层不得直接读取 concrete provider registry。

### apps/worker
- 禁止 `@bailian-studio/api`、`@bailian-studio/db`、import api sibling / apps、字面 DashScope HTTP 调用。
- 持久化通过 `@bailian-studio/persistence-runtime` 取得进程级共享句柄；只有 `LISTEN/NOTIFY` 监听器保留独立长连接。
- DashScope 执行一律经 `@bailian-studio/provider-dashscope`；任务 handler 只消费归一化 `ProviderRunner` 结果，并通过组合根注入的 `modelRegistry`/`modelCatalog` 读取模型，不直接理解 provider 请求/响应 schema 或 operation map。

### apps/studio / apps/writer / apps/canvas / apps/admin
- 可 import `@bailian-studio/model-core`（表单提交前实时校验）与 `@bailian-studio/api-client`（线缆契约）；禁止 deep-import 执行层源码。
- Studio 提交 payload 与校验入参由 `apps/studio/src/lib/generation-submit.ts` 的 `buildSubmitPayload` / `buildValidationParams` 构造，与服务端 `prepareGenerationParams` 等价。

## 5. 变更与验证流程

1. 改边界（新增消费者 / 改禁令 / 改 ownership）→ 先改本文件 → 再改 `check-package-boundaries.ts` 与对应边界测试。
2. 改模型知识（manifest）→ 改 manifest 数据 + `check:manifests` 断言 → 必要时补 model-core 纯函数测试。
3. 验证：`bun run check:boundaries`、`bun run typecheck`、涉及包的单测、`bun run verify` 全绿。
