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
- `generation-repository`：旧任务方法暂时保留兼容 facade，避免 API 调用方一次性迁移。

## 不采用的方案

- 不把任务生产事务移到 task-repository 内部；这会破坏业务表与任务表的原子性。
- 不让 task-engine 依赖数据库；纯状态机仍保持可独立测试。
- 不让 Worker 直接 import `@bailian-studio/db`；数据库句柄继续由组合根统一创建和关闭。

## 下一步

逐步从 `GenerationRepository` 的 `ContentRepository` 聚合中拆出 gallery/social、通知、提示词库、反馈/举报和 admin 分支。
第一块 gallery/social port 已完成：`generation-repository/src/social.ts` 定义窄契约，
`persistence-runtime` 在 API 组合根创建并注入，gallery 路由已不再读取这组方法的
`generationRepository`；gallery SQL 也已从 `content.ts` 物理迁入 `social.ts`。
`content.ts` 现在只通过 transitional facade 组合这些方法，待共享领域投影稳定后再移动到
独立 `social-repository` 包；旧 facade 在迁移期间继续保留。
第二块通知 port 也已完成：`notifications.ts` 拥有通知收件箱、已读状态和作者查询，
通知路由及 gallery 的通知编排均通过 `ApiDependencies.notificationRepository` 注入。
提示词库、用户反馈和内容举报也已完成同样迁移：`prompt-library.ts`、`feedback.ts`、
`content-reports.ts` 分别拥有各自的 SQL 与窄 port，API 组合根创建并注入三者，
旧 `content.ts` 只通过 facade 组合兼容接口。举报处理时的画廊下架联动仍显式调用
admin gallery 能力，不把跨域治理动作隐藏在举报 repository 内。
admin gallery 也已完成独立 `AdminGalleryRepository` port：隐藏/恢复、批量治理、软删、
封禁联动和后台预览 SQL 已归档到 `admin-gallery.ts`，admin 路由与举报下架联动通过组合根注入。
管理任务中心与成本/留存分析随后分别归档到 `admin-tasks.ts`、`analytics.ts`，API 也已通过
对应窄 port 注入；`content.ts` 现在只保留兼容 facade。资产与分享也已完成 API 侧的窄 port
收敛：`AssetRepository`、`ShareRepository`、`PublicShareRepository` 已进入 `ApiDependencies`，
生产组合根复用同一个数据库句柄并分别创建 repository。资产/分享 SQL 已物理归档到
`assets.ts`、`shares.ts`。随后已从 `GenerationRepository` 核心接口移除这些方法，
URL 工厂与隔离测试句柄已改为分别暴露核心 repository 和各域窄 port；完整兼容聚合只保留
在仓储包自身的低层回归接缝。下一步继续清理测试应用工厂里的隐式 legacy cast。

API 审计也已独立为 `AuditRepository` port：路由只注入审计写入能力，不再为了
`recordApiAuditEvent` 持有完整 `GenerationRepository`；审计写入失败继续由 API 层吞并并记录
稳定告警，不能反向改变业务响应。

本轮进一步把 API 审计写入 SQL 从中央 `repository.ts` 移到
`generation-repository/src/audit-events.ts`。生产组合根直接创建 `AuditRepository`，
`GenerationRepository` 核心接口不再声明 `recordAuditEvent`；旧 URL 工厂和隔离测试仍可
通过 `GenerationRepositoryCompat` 使用转发方法，作为明确的迁移接缝。

用户用量与 admin 调用统计也已完成读取边界收敛：`UsageRepository` 负责用户时间窗口
聚合，`AnalyticsRepository` 负责后台调用统计；两者的查询 SQL 分别归档在 `usage.ts`
与 `analytics.ts`。随后已把生成应用服务的每日限额预检改为显式注入 `UsageRepository`，
并从 `GenerationRepository` 核心接口移除 `getDailyGenerationUsage` / `getGenerationUsage`；
URL 工厂与隔离测试句柄现在直接暴露 `UsageRepository`。这一步只移动读模型职责，不改变
generation 账本的写入与结算事务。

Provider 出站请求审计也已完成写入边界收敛：Worker 通过
`ProviderRequestAuditRepository` 写入 `started` / `finished` 记录，具体 SQL 位于
`provider-requests.ts`；生成详情读取的 provider 请求投影继续留在 generation repository，
因此没有改变对外响应。`GenerationRepository` 核心接口不再暴露这两个 Worker 写入方法，
仓储包自身的低层回归接缝仍保留转发，URL 工厂与隔离测试句柄则直接提供该 port。

最后一轮 content 接口收缩已完成：生产 API/Worker 均已使用窄 port，`GenerationRepository`
核心接口移除了 gallery、通知、提示词库、反馈/举报、admin 和分析方法；`content.ts` 与
`GenerationRepositoryCompat` 已不再由 URL 工厂/隔离测试句柄向外传播，仅作为仓储包自身
低层回归接缝存在。待测试应用工厂的 legacy cast 清零后，可删除该类型、中央转发和对应
兼容测试，而不影响生产组合根。
