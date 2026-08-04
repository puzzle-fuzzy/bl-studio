import type { InferSelectModel } from 'drizzle-orm'
import { mediaJobs, taskRecords } from '@bailian-studio/db'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import type { MediaJob } from './types'

export type MediaJobRow = InferSelectModel<typeof mediaJobs>
export type TaskRecordRow = InferSelectModel<typeof taskRecords>

function isTaskError(value: unknown): value is TaskError {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'category' in value &&
    'message' in value &&
    'retriable' in value
}

export function toMediaJob(row: MediaJobRow): MediaJob {
  return {
    id: row.id,
    userId: row.userId,
    operation: row.operation as MediaJob['operation'],
    status: row.status as MediaJob['status'],
    sourceAssetId: row.sourceAssetId ?? undefined,
    sourceKind: row.sourceKind as MediaJob['sourceKind'],
    outputAssetId: row.outputAssetId ?? undefined,
    input: row.inputJson,
    output: row.outputJson ?? undefined,
    error: row.errorJson === null || !isTaskError(row.errorJson) ? undefined : row.errorJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

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
