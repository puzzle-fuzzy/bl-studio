import type { InferSelectModel } from 'drizzle-orm'
import type { mediaJobs } from '@bailian-studio/db'
import type { TaskError } from '@bailian-studio/task-engine'
import type { MediaJob } from './types'

export type MediaJobRow = InferSelectModel<typeof mediaJobs>
export { toTaskRecord } from '@bailian-studio/task-repository'

function isTaskError(value: unknown): value is TaskError {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'category' in value
    && 'message' in value
    && 'retriable' in value
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
