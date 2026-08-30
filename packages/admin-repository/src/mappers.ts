import type { InferSelectModel } from 'drizzle-orm'
import type { generationArtifacts, taskRecords } from '@bailian-studio/db'
import type { GenerationArtifact } from './types'

export type GenerationArtifactRow = InferSelectModel<typeof generationArtifacts>
export type TaskRecordRow = InferSelectModel<typeof taskRecords>

export { toTaskRecord } from '@bailian-studio/task-repository'

export function toGenerationArtifact(row: GenerationArtifactRow): GenerationArtifact {
  return {
    id: row.id,
    recordId: row.recordId,
    userId: row.userId,
    kind: row.kind as GenerationArtifact['kind'],
    sourceUrl: row.sourceUrl ?? undefined,
    text: row.text ?? undefined,
    mimeType: row.mimeType ?? undefined,
    storageProvider: row.storageProvider === null ? undefined : row.storageProvider as GenerationArtifact['storageProvider'],
    storageKey: row.storageKey ?? undefined,
    storageUrl: row.storageUrl ?? undefined,
    byteSize: row.byteSize ?? undefined,
    status: row.status as GenerationArtifact['status'],
    errorJson: row.errorJson ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
