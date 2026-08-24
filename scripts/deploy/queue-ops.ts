/**
 * 持久化任务队列/outbox 的运维探针与 retention。
 *
 * 该命令刻意独立成脚本，可从 cron 或一次性维护容器运行，
 * 无需在公开 API 路由上暴露队列内部实现。retention 默认 dry-run，
 * 只有传入 `--apply` 才会真正删除任何行。
 *
 * 示例：
 *   DATABASE_URL=... pnpm exec tsx scripts/deploy/queue-ops.ts health
 *   DATABASE_URL=... pnpm exec tsx scripts/deploy/queue-ops.ts retention
 *   DATABASE_URL=... pnpm exec tsx scripts/deploy/queue-ops.ts retention --apply
 */
import postgres from 'postgres'

export type QueueOpsCommand =
  | { command: 'health' }
  | {
      command: 'retention'
      apply: boolean
      taskRetentionDays: number
      eventRetentionDays: number
      batchSize: number
    }

export interface QueueHealthSnapshot {
  generatedAt: string
  queuedCount: number
  runningCount: number
  staleRunningCount: number
  billingAnomalyCount: number
  staleReservationCount: number
  artifactFailureCount: number
  creditReconciliationViolationCount: number
  oldestQueuedAt?: string
  latestEventAt?: string
  eventLagMs: number
}

export interface QueueHealthClassification {
  status: 'ok' | 'warning' | 'critical'
  reasons: string[]
}

export interface QueueDbClient {
  unsafe<T extends Record<string, unknown>>(
    query: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]>
}

export interface RetentionResult {
  apply: boolean
  taskRetentionDays: number
  eventRetentionDays: number
  batchSize: number
  taskCutoff: string
  eventCutoff: string
  taskRows: number
  eventRows: number
}

const QUEUED_WARNING_AFTER_MS = 5 * 60 * 1000
const QUEUED_CRITICAL_AFTER_MS = 15 * 60 * 1000
const EVENT_WARNING_AFTER_MS = 60 * 1000
const EVENT_CRITICAL_AFTER_MS = 5 * 60 * 1000
const STALE_RESERVATION_AFTER_MS = 24 * 60 * 60 * 1000

const TASK_HEALTH_QUERY = `
  select
    count(*) filter (where status = 'queued')::int as queued_count,
    count(*) filter (where status = 'running')::int as running_count,
    count(*) filter (where status = 'running' and locked_until <= $1::timestamptz)::int as stale_running_count,
    min(next_run_at) filter (where status = 'queued') as oldest_queued_at
  from task_records
`

const EVENT_HEALTH_QUERY = `
  select max(created_at) as latest_event_at
  from generation_events
`

const BILLING_HEALTH_QUERY = `
  select count(*)::int as billing_anomaly_count
  from usage_records
  where provider_cost_cents is not null
    and provider_cost_cents > estimated_cost_cents
`

const STALE_RESERVATION_HEALTH_QUERY = `
  select count(*)::int as stale_reservation_count
  from credit_ledger_entries reserve_entry
  join generation_records generation on generation.id = reserve_entry.generation_id
  where reserve_entry.kind = 'reserve'
    and reserve_entry.created_at <= $1::timestamptz
    and generation.status in ('succeeded', 'failed', 'cancelled')
    and not exists (
      select 1
      from credit_ledger_entries terminal_entry
      where terminal_entry.generation_id = reserve_entry.generation_id
        and terminal_entry.kind in ('settle', 'refund')
    )
`

const ARTIFACT_HEALTH_QUERY = `
  select count(*)::int as artifact_failure_count
  from generation_artifacts
  where status = 'failed'
`

const CREDIT_RECONCILIATION_HEALTH_QUERY = `
  with latest_ledger as (
    select distinct on (account_id)
      account_id,
      available_balance_cents,
      reserved_balance_cents
    from credit_ledger_entries
    order by account_id, created_at desc, id desc
  )
  select count(*) filter (
    where account.available_cents < 0
      or account.reserved_cents < 0
      or account.available_cents <> coalesce(latest_ledger.available_balance_cents, 0)
      or account.reserved_cents <> coalesce(latest_ledger.reserved_balance_cents, 0)
  )::int as credit_reconciliation_violation_count
  from credit_accounts account
  left join latest_ledger on latest_ledger.account_id = account.id
`

const TASK_RETENTION_COUNT_QUERY = `
  select count(*)::int as count
  from task_records
  where status in ('succeeded', 'failed', 'cancelled')
    and coalesce(completed_at, updated_at) < $1::timestamptz
`

const EVENT_RETENTION_COUNT_QUERY = `
  select count(*)::int as count
  from generation_events
  where created_at < $1::timestamptz
`

const TASK_RETENTION_DELETE_QUERY = `
  delete from task_records
  where id in (
    select id
    from task_records
    where status in ('succeeded', 'failed', 'cancelled')
      and coalesce(completed_at, updated_at) < $1::timestamptz
    order by coalesce(completed_at, updated_at), id
    limit $2
    for update skip locked
  )
  returning id
`

const EVENT_RETENTION_DELETE_QUERY = `
  delete from generation_events
  where id in (
    select id
    from generation_events
    where created_at < $1::timestamptz
    order by created_at, id
    limit $2
    for update skip locked
  )
  returning id
`

export function parseQueueOpsArgs(args: readonly string[]): QueueOpsCommand {
  const command = args[0] ?? 'health'
  if (command === 'health' && args.length === 1) return { command: 'health' }
  if (command !== 'retention') {
    throw new Error(`Unknown queue operation '${command}'. Expected 'health' or 'retention'.`)
  }

  let apply = false
  let taskRetentionDays = 30
  let eventRetentionDays = 8
  let batchSize = 500

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--apply') {
      apply = true
      continue
    }
    if (argument === '--task-days') {
      taskRetentionDays = parsePositiveInteger(args[++index], '--task-days')
      continue
    }
    if (argument === '--event-days') {
      eventRetentionDays = parsePositiveInteger(args[++index], '--event-days')
      continue
    }
    if (argument === '--batch-size') {
      batchSize = parsePositiveInteger(args[++index], '--batch-size')
      if (batchSize > 10_000) throw new Error('--batch-size must be at most 10000')
      continue
    }
    throw new Error(`Unknown retention option '${argument}'.`)
  }

  return { command: 'retention', apply, taskRetentionDays, eventRetentionDays, batchSize }
}

export async function readQueueHealth(
  db: QueueDbClient,
  now = new Date(),
): Promise<QueueHealthSnapshot> {
  const nowIso = now.toISOString()
  const staleReservationCutoff = new Date(now.getTime() - STALE_RESERVATION_AFTER_MS).toISOString()
  // 并行执行六类只读探针查询，汇总后用于健康分级（ok/warning/critical）。
  const [taskRows, eventRows, billingRows, staleReservationRows, artifactRows, creditRows] = await Promise.all([
    db.unsafe<{
      queued_count: number | string
      running_count: number | string
      stale_running_count: number | string
      oldest_queued_at: Date | string | null
    }>(TASK_HEALTH_QUERY, [nowIso]),
    db.unsafe<{ latest_event_at: Date | string | null }>(EVENT_HEALTH_QUERY),
    db.unsafe<{ billing_anomaly_count: number | string }>(BILLING_HEALTH_QUERY),
    db.unsafe<{ stale_reservation_count: number | string }>(STALE_RESERVATION_HEALTH_QUERY, [staleReservationCutoff]),
    db.unsafe<{ artifact_failure_count: number | string }>(ARTIFACT_HEALTH_QUERY),
    db.unsafe<{ credit_reconciliation_violation_count: number | string }>(CREDIT_RECONCILIATION_HEALTH_QUERY),
  ])

  const task = taskRows[0]
  const event = eventRows[0]
  const oldestQueuedAt = toIso(task?.oldest_queued_at)
  const latestEventAt = toIso(event?.latest_event_at)
  const eventTimestamp = latestEventAt === undefined ? undefined : Date.parse(latestEventAt)

  return {
    generatedAt: nowIso,
    queuedCount: toCount(task?.queued_count),
    runningCount: toCount(task?.running_count),
    staleRunningCount: toCount(task?.stale_running_count),
    billingAnomalyCount: toCount(billingRows[0]?.billing_anomaly_count),
    staleReservationCount: toCount(staleReservationRows[0]?.stale_reservation_count),
    artifactFailureCount: toCount(artifactRows[0]?.artifact_failure_count),
    creditReconciliationViolationCount: toCount(creditRows[0]?.credit_reconciliation_violation_count),
    ...(oldestQueuedAt !== undefined ? { oldestQueuedAt } : {}),
    ...(latestEventAt !== undefined ? { latestEventAt } : {}),
    eventLagMs: eventTimestamp === undefined || !Number.isFinite(eventTimestamp)
      ? 0
      : Math.max(0, now.getTime() - eventTimestamp),
  }
}

export function classifyQueueHealth(snapshot: QueueHealthSnapshot): QueueHealthClassification {
  const reasons: string[] = []
  let status: QueueHealthClassification['status'] = 'ok'

  if (snapshot.staleRunningCount > 0) {
    status = 'critical'
    reasons.push('stale running tasks detected')
  }

  if (snapshot.creditReconciliationViolationCount > 0) {
    status = 'critical'
    reasons.push('credit reconciliation violations detected')
  }
  if (snapshot.staleReservationCount > 0) {
    status = 'critical'
    reasons.push('stale credit reservations detected')
  }
  if (snapshot.billingAnomalyCount > 0) {
    if (status === 'ok') status = 'warning'
    reasons.push('billing anomalies detected')
  }
  if (snapshot.artifactFailureCount > 0) {
    if (status === 'ok') status = 'warning'
    reasons.push('artifact persistence failures detected')
  }

  const oldestQueuedTimestamp = snapshot.oldestQueuedAt === undefined
    ? undefined
    : Date.parse(snapshot.oldestQueuedAt)
  const queuedAgeMs = oldestQueuedTimestamp === undefined || !Number.isFinite(oldestQueuedTimestamp)
    ? 0
    : Math.max(0, Date.parse(snapshot.generatedAt) - oldestQueuedTimestamp)
  if (snapshot.queuedCount > 0 && queuedAgeMs >= QUEUED_CRITICAL_AFTER_MS) {
    status = 'critical'
    reasons.push('oldest queued task exceeds critical threshold')
  } else if (snapshot.queuedCount > 0 && queuedAgeMs >= QUEUED_WARNING_AFTER_MS) {
    if (status === 'ok') status = 'warning'
    reasons.push('oldest queued task exceeds warning threshold')
  }

  if (snapshot.eventLagMs >= EVENT_CRITICAL_AFTER_MS) {
    status = 'critical'
    reasons.push('event outbox lag exceeds critical threshold')
  } else if (snapshot.eventLagMs >= EVENT_WARNING_AFTER_MS) {
    if (status === 'ok') status = 'warning'
    reasons.push('event outbox lag exceeds warning threshold')
  }

  return { status, reasons }
}

export async function runRetention(
  db: QueueDbClient,
  policy: Extract<QueueOpsCommand, { command: 'retention' }>,
  now = new Date(),
): Promise<RetentionResult> {
  validateRetentionPolicy(policy)
  const taskCutoff = new Date(now.getTime() - policy.taskRetentionDays * 24 * 60 * 60 * 1000)
  const eventCutoff = new Date(now.getTime() - policy.eventRetentionDays * 24 * 60 * 60 * 1000)

  if (!policy.apply) {
    const [taskRows, eventRows] = await Promise.all([
      db.unsafe<{ count: number | string }>(TASK_RETENTION_COUNT_QUERY, [taskCutoff.toISOString()]),
      db.unsafe<{ count: number | string }>(EVENT_RETENTION_COUNT_QUERY, [eventCutoff.toISOString()]),
    ])
    return {
      ...policy,
      taskCutoff: taskCutoff.toISOString(),
      eventCutoff: eventCutoff.toISOString(),
      taskRows: toCount(taskRows[0]?.count),
      eventRows: toCount(eventRows[0]?.count),
    }
  }

  const [taskRows, eventRows] = await Promise.all([
    deleteInBatches(db, TASK_RETENTION_DELETE_QUERY, taskCutoff, policy.batchSize),
    deleteInBatches(db, EVENT_RETENTION_DELETE_QUERY, eventCutoff, policy.batchSize),
  ])
  return {
    ...policy,
    taskCutoff: taskCutoff.toISOString(),
    eventCutoff: eventCutoff.toISOString(),
    taskRows,
    eventRows,
  }
}

async function deleteInBatches(
  db: QueueDbClient,
  query: string,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  let total = 0
  while (true) {
    const rows = await db.unsafe<{ id: string }>(query, [cutoff.toISOString(), batchSize])
    total += rows.length
    if (rows.length < batchSize) return total
  }
}

function validateRetentionPolicy(policy: Extract<QueueOpsCommand, { command: 'retention' }>): void {
  if (!Number.isSafeInteger(policy.taskRetentionDays) || policy.taskRetentionDays < 1) {
    throw new Error('taskRetentionDays must be a positive integer')
  }
  if (!Number.isSafeInteger(policy.eventRetentionDays) || policy.eventRetentionDays < 1) {
    throw new Error('eventRetentionDays must be a positive integer')
  }
  if (!Number.isSafeInteger(policy.batchSize) || policy.batchSize < 1 || policy.batchSize > 10_000) {
    throw new Error('batchSize must be an integer between 1 and 10000')
  }
}

function parsePositiveInteger(value: string | undefined, option: string): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`${option} requires a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${option} requires a positive integer`)
  return parsed
}

function toCount(value: number | string | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: queue-ops.ts health | retention [--apply] [--task-days N] [--event-days N] [--batch-size N]')
    return
  }

  const command = parseQueueOpsArgs(args)
  const databaseUrl = process.env['DATABASE_URL']?.trim()
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required. Refusing to inspect an implicit database.')
  }

  const db = postgres(databaseUrl, { max: 1 })
  try {
    if (command.command === 'health') {
      const snapshot = await readQueueHealth(db)
      const classification = classifyQueueHealth(snapshot)
      console.log(JSON.stringify({ snapshot, ...classification }))
      if (classification.status === 'critical') process.exitCode = 2
      return
    }

    const result = await runRetention(db, command)
    console.log(JSON.stringify(result))
  } finally {
    await db.end({ timeout: 5 })
  }
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
