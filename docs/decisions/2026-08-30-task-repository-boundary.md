# 任务队列生命周期与业务生产事务边界

- 状态：Accepted（第一阶段已实现）
- 日期：2026-08-30
- 前置：P1-C 任务序列化统一、P1-B GenerationRepository 拆分

## 决策

将 `task_records` 的持久化职责拆成两个边界：

1. `@bailian-studio/task-repository` 拥有任务行的序列化、插入、claim、租约续期、状态保存和回读。
2. generation、media、director repository 仍拥有各自的业务事务，并把同一个 Drizzle transaction 传给 `enqueueTask`。

这样“业务记录 + 初始任务”仍在一个数据库事务内提交；任务包不需要知道业务表，也不负责开启或提交跨域事务。

## 运行时依赖

- `task-engine`：无 IO 的状态机，只负责 `TaskRecord` 的合法转换。
- `task-repository`：数据库生命周期适配，负责 `Date`/JSON 映射和 `FOR UPDATE SKIP LOCKED`。
- `persistence-runtime`：为 Worker 创建共享数据库句柄，并注入任务队列 repository。
- `apps/worker`：只依赖 `claim/renew/save` 最小 port；生成领域 repository 仍作为 executor 的业务读写依赖。
- `generation-repository`：仍承载 generation 业务读写和业务事务内的初始任务写入；任务生命周期
  port 已由 Worker 单独注入，核心接口不再包含队列 claim/lease/save/read 方法。

## 不采用的方案

- 不把任务生产事务移到 task-repository 内部；这会破坏业务表与任务表的原子性。
- 不让 task-engine 依赖数据库；纯状态机仍保持可独立测试。
- 不让 Worker 直接 import `@bailian-studio/db`；数据库句柄继续由组合根统一创建和关闭。

## 当前落地状态

内容、社交、通知、提示词库、反馈、举报、admin gallery、admin 任务、分析、资产、分享、
用户用量和 API 审计均已切换到各自窄 port，SQL 也已物理归档到对应模块；生产 API/Worker
通过组合根注入这些 port。举报后的画廊下架联动仍由 API 显式编排，不隐藏跨域治理动作。

`GenerationRepository` 核心接口已移除上述内容/横切能力，URL 工厂与隔离测试句柄分别暴露
核心 repository 和各域窄 port；`GenerationRepositoryCompat` 与 `content.ts` 已删除，
仓储测试按窄 port 组合 harness。API 测试工厂也不再把核心 repository 隐式强转为其它 port。

Worker 的 `TaskQueueRepository` 注入已从可选兼容路径变为强制依赖；generation、media、director
由组合根注入同一个 `TaskQueueTransactionStore`，业务记录和初始任务继续放在各自同一个事务中。
事务 store 统一任务写入和业务事务内窄查询约定，但不升级为 request-scoped transaction context。

生成详情诊断读取已进一步从 `GenerationRepository` 核心接口移入独立的
`GenerationDiagnosticsRepository`。它是只读投影边界，允许联合读取 generation、task 和
provider request 数据，但不拥有任何状态迁移或任务生命周期写入。
