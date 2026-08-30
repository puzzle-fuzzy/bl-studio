# @bailian-studio/audit-repository

审计事件 outbox 的持久化消费者边界。

- `claim` 使用 PostgreSQL `FOR UPDATE SKIP LOCKED`，同一事件只会被一个 consumer 租约领取。
- `deliver` 在事务内写入 `audit_logs`，通过 `outbox_event_id` 唯一索引收敛 at-least-once 重试。
- 过期 processing 租约可被重新领取；投递异常按指数退避，超过最大次数进入 `failed`。
- `listFailed` 与 `requeueFailed` 只用于管理员运营恢复，重放会重置 attempts 并保留操作审计在 API 层完成。
- 不负责业务审计 payload 的创建；资产收录 producer 位于 `creative-asset-repository`。

Worker 通过 `@bailian-studio/persistence-runtime` 创建此 repository，并由 `WorkerLoop` 周期消费。
