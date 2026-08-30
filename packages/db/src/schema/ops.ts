/**
 * 运维域：模型成本单价、媒体处理任务、异步任务队列核心表、worker 心跳。
 * task_records 的 recordId/userId 是无外键的普通列（任务队列不绑定单一业务表），
 * 因此本域只依赖 identity 的 users。
 */

import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { users } from './identity'

/**
 * 每模型成本单价（admin 维护）—— 供成本毛利分析：成本 = 调用数 × unitCostCents。
 * 播种脚本 scripts/db/seed-model-costs.ts 从 data/fixtures/model-costs.json 初始化。
 */
export const modelCosts = pgTable(
  'model_costs',
  {
    modelId: text('model_id').primaryKey(),
    unitCostCents: integer('unit_cost_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    updatedBy: text('updated_by').notNull().default('system'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'model_costs_unit_cost_non_negative',
      sql`${table.unitCostCents} >= 0`,
    ),
  ],
)

export const mediaJobs = pgTable(
  'media_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    status: text('status').notNull(),
    sourceAssetId: text('source_asset_id'),
    sourceKind: text('source_kind').notNull(),
    outputAssetId: text('output_asset_id'),
    inputJson: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
    outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
    errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
    createdBy: text('created_by').notNull().default('system'),
    updatedBy: text('updated_by').notNull().default('system'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('media_jobs_user_created_idx').on(table.userId, table.createdAt),
    index('media_jobs_status_updated_idx').on(table.status, table.updatedAt),
    index('media_jobs_source_asset_idx').on(table.sourceAssetId),
  ],
)

/**
 * 任务记录表 —— 异步任务队列的核心表。
 *
 * 配合 `SELECT ... FOR UPDATE SKIP LOCKED`（在 repository.claimNextQueuedTask
 * 中）实现无锁竞争的并发安全任务抢占：多个 worker 同时取任务时各自跳过
 * 已被对方锁住的行，互不阻塞。主要任务类型：
 *  - generation.submit：提交生成请求到 provider；
 *  - generation.poll：周期性轮询 provider 任务状态；
 *  - artifact.persist：把产物从临时 URL 拉取并存入自家存储；
 *  - canvas.execute：按拓扑顺序编排一张 Canvas 中的多个 generation；
 *  - generation.cancel：发起取消。
 *
 * 重试由 attempts/maxAttempts 控制，下次执行时间由 nextRunAt 决定（用于
 * 退避与定时任务）。
 */
export const taskRecords = pgTable(
  'task_records',
  {
    id: text('id').primaryKey(),
    /** 任务类型：generation.* | artifact.persist | media.* | director.phase | canvas.execute。 */
    type: text('type').notNull(),
    /** 任务域：generation | artifact | media | director | canvas，用于按域分组/过滤。 */
    domain: text('domain').notNull(),
    /**
     * 任务状态：queued | running | succeeded | failed | cancelled。
     * 注意：重试不落 'retry' 状态——状态机失败重试时任务回到 queued（由 attempts/
     * maxAttempts + nextRunAt 控制退避），'retry' 仅存在于注释里（P2-11，已统一）。
     * 状态机见 task engine 包；repository 是唯一合法的变更入口。
     */
    status: text('status').notNull(),
    /** 优先级（数值越大越优先），同状态下按优先级出队。 */
    priority: integer('priority').notNull(),
    /** 任务输入参数，结构由 type 决定（如 recordId、provider 任务 ID 等）。 */
    inputJson: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
    /** 任务输出结果，成功后回填。 */
    outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
    /** 当前持有该任务的 worker 实例标识，用于抢占与诊断。 */
    lockedBy: text('locked_by'),
    /** 锁过期时间；超时后视为僵尸任务可被重新抢占（见 claim 的清理逻辑）。 */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** 最近一次执行开始时间；retry 会在下一次 claim 时刷新。 */
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** 最近一次执行结束时间；queued/running 任务为空。 */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** 已尝试次数，失败时递增；达到 maxAttempts 后不再重试。 */
    attempts: integer('attempts').notNull(),
    /** 最大尝试次数上限，防止异常任务无限重试。 */
    maxAttempts: integer('max_attempts').notNull(),
    /** 下次可执行时间，支持延迟重试（退避）与定时任务；claim 按此时间过滤。 */
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    /** 失败时的错误详情（错误码、message、堆栈摘要等）。 */
    errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
    /** 关联的业务记录 ID（通常是 generation_records.id），用于反查关联任务。 */
    recordId: text('record_id'),
    /** 关联用户 ID（冗余自业务记录），便于按用户筛选与权限校验。 */
    userId: text('user_id'),
    /** 分布式链路追踪 ID，串起整条请求生命周期的日志。 */
    traceId: text('trace_id'),
    createdBy: text('created_by').notNull().default('system'),
    updatedBy: text('updated_by').notNull().default('system'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'task_records_status_check',
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check('task_records_attempts_check', sql`${table.attempts} >= 0`),
    check('task_records_max_attempts_check', sql`${table.maxAttempts} > 0`),
    // 任务队列的核心索引：claim 按 status → nextRunAt → priority → createdAt
    // 顺序筛选并抢占。FOR UPDATE SKIP LOCKED 在此索引上高效工作。
    index('task_records_queue_idx').on(
      table.status,
      table.nextRunAt,
      table.priority,
      table.createdAt,
    ),
    // P1-31：claim 排序子句是 `order by priority desc, created_at asc`（见
    // claimNextQueuedTask）。组合索引在 secondary 列方向上不匹配 → 每次 claim 都堆排序。
    // 补一个列方向匹配的 partial index，让 queued 入队排序直接用索引。
    index('task_records_queue_priority_idx')
      .on(table.priority.desc(), table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    // 僵尸任务清理：按锁持有者 + 锁过期时间扫描需要回收的任务。
    index('task_records_lock_idx').on(table.lockedBy, table.lockedUntil),
    // 业务记录反查：列出某条生成记录的全部关联任务。
    index('task_records_record_idx').on(table.recordId),
    // 管理后台任务中心：keyset (created_at, id) 倒序翻页。
    index('task_records_created_idx').on(table.createdAt, table.id),
    // Canvas 管理分析：窗口筛选只读取未删除的 canvas.execute 任务，避免随任务总量增长退化为全表扫描。
    index('task_records_canvas_analytics_idx')
      .on(table.createdAt, table.id)
      .where(sql`${table.type} = 'canvas.execute' and ${table.domain} = 'canvas' and ${table.deletedAt} is null`),
  ],
)

/**
 * Worker 存活心跳。它与 task lease heartbeat 不同：lease 只证明某个任务仍被
 * 某个 worker 持有，本表用于 API 判断是否至少有一个 worker 仍能消费新任务。
 */
export const workerHeartbeats = pgTable(
  'worker_heartbeats',
  {
    workerId: text('worker_id').primaryKey(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('worker_heartbeats_status_seen_idx').on(
      table.status,
      table.lastSeenAt,
    ),
  ],
)
