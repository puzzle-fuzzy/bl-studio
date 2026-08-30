/**
 * 数据库 Schema 按业务域拆分的统一出口（barrel）。
 *
 * 域文件与依赖方向（无环）：
 *  - identity   用户 / 动作令牌 / 会话 / 审计日志（根，无跨域依赖）
 *  - ops        模型成本 / 媒体任务 / 任务队列 / worker 心跳（→ identity）
 *  - generation 生成记录 / 产物 / 分享 / 用户资产 / outbox / 审计 / 用量（→ identity, ops）
 *  - credits    积分账户与账本（→ identity, generation）
 *  - creative   创意项目 / 资产 / 版本 / 参考图 / 生成上下文（→ identity, generation）
 *  - community  点赞 / 收藏 / 提示词库 / 反馈 / 举报 / 通知（→ identity, generation）
 *  - director   短剧项目 / 剧本 / 阶段 / 角色 / 场景 / 分镜（→ identity）
 *
 * 全仓横切约定（自原单文件 schema.ts 迁移，语义不变）：
 *  - 软删除：业务表统一带 deletedAt/deletedBy；唯一索引多为 `WHERE deletedAt
 *    IS NULL` 形态的部分唯一索引，已删除记录不再占用唯一性名额。
 *  - 审计列：所有业务表带 createdBy/updatedBy（默认 'system'）+ createdAt/
 *    updatedAt（`withTimezone: true`，存 UTC）。
 *  - 级联删除：FK `onDelete: 'cascade'` 清理从属行；自引用衍生关系用
 *    `onDelete: 'set null'`（parentRecordId）。
 *  - 分布式锁：task_records 用 lockedBy/lockedUntil 实现 worker 抢占，配合
 *    `SELECT ... FOR UPDATE SKIP LOCKED` 做无锁竞争认领（见 generation-repository）。
 *
 * 生成主链路数据流：
 *   用户请求 → generation_records(submitting) + task_records(generation.submit)
 *   worker 抢占 → markProcessing → providerTaskId → task_records(generation.poll)
 *   完成后 → generation_records(succeeded) → 可选 task_records(artifact.persist)
 *   产物落库 → generation_artifacts(succeeded)
 *
 * schema 与迁移链的一致性由 scripts/verify/check-db-migrations.ts（drizzle-kit
 * generate 离线对账）门禁保证；修改任何域文件后必须生成并提交对应迁移。
 */

export * from './identity'
export * from './ops'
export * from './generation'
export * from './credits'
export * from './creative'
export * from './community'
export * from './director'
export * from './canvas'
