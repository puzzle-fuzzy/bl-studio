import type { InferSelectModel } from 'drizzle-orm'
import type { taskRecords } from '@bailian-studio/db'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'

export type TaskRecordRow = InferSelectModel<typeof taskRecords>

function isTaskError(value: unknown): value is TaskError {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'category' in value
    && 'message' in value
    && 'retriable' in value
}

/** DB 行 → task-engine 领域记录，封闭 Date/nullable/JSON 的差异。 */
export function toTaskRecord(row: TaskRecordRow): TaskRecord {
  return {
    id: row.id,
    type: row.type as TaskRecord['type'],
    domain: row.domain as TaskRecord['domain'],
    status: row.status as TaskRecord['status'],
    priority: row.priority,
    input: row.inputJson,
    output: row.outputJson ?? undefined,
    lockedBy: row.lockedBy ?? undefined,
    lockedUntil: row.lockedUntil?.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRunAt: row.nextRunAt.toISOString(),
    errorJson: row.errorJson === null || !isTaskError(row.errorJson) ? undefined : row.errorJson,
    recordId: row.recordId ?? undefined,
    userId: row.userId ?? undefined,
    traceId: row.traceId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
