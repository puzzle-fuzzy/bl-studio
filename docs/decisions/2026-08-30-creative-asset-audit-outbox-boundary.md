# 创意资产收录审计 outbox 边界

- 状态：Accepted（生产端与 Worker 消费端第一阶段已实现）
- 日期：2026-08-30
- 前置：单资源与批次级 `collect-from-generation` 已具备事务边界

## 背景

当前 `audit_logs` 的 HTTP 写入是 best-effort：审计表短暂不可用时，业务响应不能因此失败。这适合登录、读取等外围事件，但不能保证“资产已经收录”一定留下可追踪的业务证据。若在业务事务提交后再直接写 `audit_logs`，API 进程在两个动作之间崩溃就会产生审计缺口。

## 决策

成功的单资源或批量资产收录，在同一 PostgreSQL transaction 内追加一条 `audit_event_outbox`：

- 业务表、批次表、批次项、版本、参考图和 outbox 要么全部提交，要么全部回滚。
- outbox 只保存 `asset.import`、结果、操作者、目标和资产数量等最小摘要；不保存 prompt、完整请求体、storage key、signed URL 或 provider 原始响应。
- outbox 行使用 `pending → processing → succeeded/failed` 状态、`attempts`、`availableAt` 和 `lastError` 预留重试/死信边界。
- Worker 消费端写入 `audit_logs.outboxEventId`，用唯一索引把 at-least-once 投递收敛成幂等结果。
- 幂等重试命中已有资产/批次时不重复创建收录事件；事件描述的是一次成功的业务提交，而不是每次 HTTP 重放。

## 文件职责

| 层 | 职责 | 位置 |
| --- | --- | --- |
| schema | 定义 outbox 状态、索引与审计读模型的投递幂等字段 | `packages/db/src/schema/identity.ts` |
| asset persistence | 在收录事务中写入最小审计摘要 | `packages/creative-asset-repository/src/audit-outbox.ts` |
| asset use case | 只负责调用收录 repository，不接触 HTTP 或消费者状态 | `apps/api/src/modules/creative-assets/service.ts` |
| consumer | claim、投递 `audit_logs`、重试和终态失败 | `packages/audit-repository` + `apps/worker/src/worker-loop.ts`，不放回 Studio 页面 |
| recovery API | 管理员查询失败事件、人工重放并留下操作审计 | `apps/api/src/modules/admin/routes.ts`，不允许普通用户访问 |

## 恢复边界

当前收录只引用已经落存的 `user_assets`，没有复制、转码或第三方调用；事务回滚就是完整恢复机制。outbox 消费失败只影响审计读模型，不回滚已经成功的资产收录。若未来收录触发外部副作用，必须由另一个 outbox 事件驱动，并为该消费者单独定义重试、死信和人工重放，不把外部状态塞进资产事务。

## 下一步

Worker 已接入一组最小进程内指标，作为后续 Prometheus/Loki 接入前的稳定命名契约：

| 指标 | tag | 含义 |
| --- | --- | --- |
| `worker.audit_outbox.events` | `status=claimed/delivered/retried/failed` | 事件量；`failed` 只统计达到最大尝试次数后的终态失败 |
| `worker.audit_outbox.drain` | `status=completed/error` | 一轮消费是否完成；数据库异常不会打断 generation 消费 |
| `worker.audit_outbox.drain_ms` | `status=completed/error` | 一轮 claim + 投递的耗时汇总 |

这些指标当前随 Worker 的 `metricsSnapshot()` 和结构化日志存在于进程内，重启后清零；Grafana 的 `审计 Outbox 运营` 仪表盘通过现有 Alloy → Loki 链路读取快照，因此不新增 Prometheus 或独立持久化指标服务。推荐告警门槛为：终态失败量 > 0 立即告警；连续 5 分钟 `drain{status=error}` > 0 告警；`drain_ms` 的 max 超过 5 秒持续 10 分钟告警。若部署侧未来需要 p95，应在外部 exporter 侧使用 histogram，而不是从当前 summary 反推。当前 `audit_event_outbox` 已有并发 claim、幂等投递、租约恢复、指数退避、管理员人工重放和 Grafana 运营视图；后续再根据实际告警噪声决定是否引入专门的指标存储。
