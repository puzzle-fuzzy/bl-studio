import { and, eq, isNull } from 'drizzle-orm'
import { mediaJobs, taskRecords, userAssets, type BailianStudioDb } from '@bailian-studio/db'
import type { TaskRecord } from '@bailian-studio/task-engine'
import { createMediaJobId, createMediaTaskId } from './id'
import { MediaRepositoryError } from './errors'
import { toMediaJob, toTaskRecord } from './mappers'
import type {
  CompleteMediaJobInput,
  CreateMediaJobInput,
  CreateMediaJobResult,
  FailMediaJobInput,
  GetMediaJobInput,
  MediaJob,
  MediaSource,
} from './types'

export interface CreateMediaRepositoryOptions {
  db: BailianStudioDb
}

export interface MediaRepository {
  createMediaJob(input: CreateMediaJobInput): Promise<CreateMediaJobResult>
  getMediaJob(input: GetMediaJobInput): Promise<MediaJob | undefined>
  getMediaJobById(jobId: string): Promise<MediaJob | undefined>
  getMediaSource(jobId: string): Promise<MediaSource | undefined>
  markMediaJobProcessing(jobId: string, now?: string): Promise<MediaJob>
  completeMediaJob(input: CompleteMediaJobInput): Promise<MediaJob>
  failMediaJob(input: FailMediaJobInput): Promise<MediaJob>
}

function nowIso(): string {
  return new Date().toISOString()
}

function toDate(value: string): Date {
  return new Date(value)
}

function taskValues(task: TaskRecord): typeof taskRecords.$inferInsert {
  return {
    id: task.id,
    type: task.type,
    domain: task.domain,
    status: task.status,
    priority: task.priority,
    inputJson: task.input,
    outputJson: task.output ?? null,
    lockedBy: task.lockedBy ?? null,
    lockedUntil: task.lockedUntil === undefined ? null : toDate(task.lockedUntil),
    startedAt: task.startedAt === undefined ? null : toDate(task.startedAt),
    completedAt: task.completedAt === undefined ? null : toDate(task.completedAt),
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    nextRunAt: toDate(task.nextRunAt),
    errorJson: task.errorJson === undefined ? null : taskErrorJson(task.errorJson),
    recordId: task.recordId ?? null,
    userId: task.userId ?? null,
    traceId: task.traceId ?? null,
    createdAt: toDate(task.createdAt),
    updatedAt: toDate(task.updatedAt),
  }
}

function taskErrorJson(error: NonNullable<TaskRecord['errorJson']>): Record<string, unknown> {
  return {
    category: error.category,
    message: error.message,
    retriable: error.retriable,
    ...(error.code !== undefined ? { code: error.code } : {}),
  }
}

function validateCreateInput(input: CreateMediaJobInput): void {
  if (input.operation !== 'video.extract_audio') {
    throw new MediaRepositoryError('MEDIA_JOB_INVALID_OPERATION', `Unsupported media operation: ${input.operation}`)
  }
  if (input.source.kind !== 'video') {
    throw new MediaRepositoryError('MEDIA_JOB_INVALID_OPERATION', 'video.extract_audio requires a video source')
  }
  if (input.source.assetId.trim().length === 0) {
    throw new MediaRepositoryError('MEDIA_SOURCE_ASSET_NOT_FOUND', 'Media source asset is required')
  }
}

function defaultOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  return { format: 'mp3', ...(options ?? {}) }
}

export function createMediaRepository(options: CreateMediaRepositoryOptions): MediaRepository {
  const { db } = options

  return {
    async createMediaJob(input) {
      validateCreateInput(input)
      const now = input.now ?? nowIso()
      const jobId = createMediaJobId()
      const traceId = input.traceId ?? crypto.randomUUID()
      return db.transaction(async tx => {
        const [sourceAsset] = await tx
          .select({
            id: userAssets.id,
            fileName: userAssets.fileName,
            mimeType: userAssets.mimeType,
            byteSize: userAssets.byteSize,
            storageProvider: userAssets.storageProvider,
            storageKey: userAssets.storageKey,
          })
          .from(userAssets)
          .where(and(
            eq(userAssets.id, input.source.assetId),
            eq(userAssets.userId, input.userId),
            eq(userAssets.kind, 'video'),
            eq(userAssets.status, 'ready'),
            isNull(userAssets.deletedAt),
          ))
          .limit(1)

        if (sourceAsset === undefined) {
          throw new MediaRepositoryError('MEDIA_SOURCE_ASSET_NOT_FOUND', `Media source asset not found: ${input.source.assetId}`)
        }

        const inputJson = {
          source: {
            assetId: sourceAsset.id,
            kind: input.source.kind,
            fileName: input.source.fileName ?? sourceAsset.fileName,
          },
          options: defaultOptions(input.options),
        }

        const [jobRow] = await tx
          .insert(mediaJobs)
          .values({
            id: jobId,
            userId: input.userId,
            operation: input.operation,
            status: 'queued',
            sourceAssetId: sourceAsset.id,
            sourceKind: input.source.kind,
            inputJson,
            createdAt: toDate(now),
            updatedAt: toDate(now),
          })
          .returning()

        if (jobRow === undefined) {
          throw new MediaRepositoryError('DATABASE_ERROR', 'Failed to insert media job')
        }

        const task: TaskRecord = {
          id: createMediaTaskId(),
          type: 'media.process',
          domain: 'media',
          status: 'queued',
          priority: 0,
          input: {
            jobId,
            operation: input.operation,
            options: defaultOptions(input.options),
          },
          attempts: 0,
          maxAttempts: 3,
          nextRunAt: now,
          recordId: jobId,
          userId: input.userId,
          traceId,
          createdAt: now,
          updatedAt: now,
        }

        const [taskRow] = await tx.insert(taskRecords).values(taskValues(task)).returning()
        if (taskRow === undefined) {
          throw new MediaRepositoryError('DATABASE_ERROR', 'Failed to insert media task')
        }

        return { job: toMediaJob(jobRow), task: toTaskRecord(taskRow) }
      })
    },

    async getMediaJob(input) {
      const [row] = await db
        .select()
        .from(mediaJobs)
        .where(and(
          eq(mediaJobs.id, input.jobId),
          eq(mediaJobs.userId, input.userId),
          isNull(mediaJobs.deletedAt),
        ))
        .limit(1)

      return row === undefined ? undefined : toMediaJob(row)
    },

    async getMediaJobById(jobId) {
      const [row] = await db
        .select()
        .from(mediaJobs)
        .where(and(eq(mediaJobs.id, jobId), isNull(mediaJobs.deletedAt)))
        .limit(1)

      return row === undefined ? undefined : toMediaJob(row)
    },

    async getMediaSource(jobId) {
      const [row] = await db
        .select({
          storageProvider: userAssets.storageProvider,
          storageKey: userAssets.storageKey,
          fileName: userAssets.fileName,
          mimeType: userAssets.mimeType,
          byteSize: userAssets.byteSize,
        })
        .from(mediaJobs)
        .innerJoin(userAssets, eq(userAssets.id, mediaJobs.sourceAssetId))
        .where(and(
          eq(mediaJobs.id, jobId),
          isNull(mediaJobs.deletedAt),
          eq(userAssets.status, 'ready'),
          isNull(userAssets.deletedAt),
        ))
        .limit(1)

      if (row === undefined) return undefined
      if (row.storageProvider === null || row.storageKey === null || row.fileName === null || row.mimeType === null || row.byteSize === null) {
        return undefined
      }
      return {
        storageProvider: row.storageProvider,
        storageKey: row.storageKey,
        fileName: row.fileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
      }
    },

    async markMediaJobProcessing(jobId, now = nowIso()) {
      const [row] = await db
        .update(mediaJobs)
        .set({ status: 'processing', updatedAt: toDate(now) })
        .where(and(eq(mediaJobs.id, jobId), isNull(mediaJobs.deletedAt)))
        .returning()

      if (row === undefined) {
        throw new MediaRepositoryError('MEDIA_JOB_NOT_FOUND', `Media job not found: ${jobId}`)
      }
      return toMediaJob(row)
    },

    async completeMediaJob(input) {
      const now = input.now ?? nowIso()
      return db.transaction(async tx => {
        const [jobRow] = await tx
          .select()
          .from(mediaJobs)
          .where(and(eq(mediaJobs.id, input.jobId), isNull(mediaJobs.deletedAt)))
          .limit(1)
          .for('update')

        if (jobRow === undefined) {
          throw new MediaRepositoryError('MEDIA_JOB_NOT_FOUND', `Media job not found: ${input.jobId}`)
        }

        if (jobRow.status === 'succeeded') {
          if (jobRow.outputAssetId === input.outputAsset.id) return toMediaJob(jobRow)
          throw new MediaRepositoryError('MEDIA_JOB_ALREADY_COMPLETED', `Media job is already completed: ${input.jobId}`)
        }
        if (jobRow.status === 'failed' || jobRow.status === 'cancelled') {
          throw new MediaRepositoryError('MEDIA_JOB_ALREADY_COMPLETED', `Media job is terminal: ${input.jobId}`)
        }

        await tx.insert(userAssets).values({
          id: input.outputAsset.id,
          userId: jobRow.userId,
          kind: input.outputAsset.kind,
            source: 'derived',
          fileName: input.outputAsset.fileName,
          mimeType: input.outputAsset.mimeType,
          byteSize: input.outputAsset.byteSize,
          storageProvider: input.outputAsset.storageProvider,
          storageKey: input.outputAsset.storageKey,
          storageUrl: input.outputAsset.storageUrl ?? null,
          metadataJson: {
            ...(input.outputAsset.metadata ?? {}),
            mediaJobId: input.jobId,
            sourceAssetId: jobRow.sourceAssetId ?? undefined,
            operation: jobRow.operation,
          },
          status: 'ready',
          createdAt: toDate(now),
          updatedAt: toDate(now),
        })

        const [updated] = await tx
          .update(mediaJobs)
          .set({
            status: 'succeeded',
            outputAssetId: input.outputAsset.id,
            outputJson: input.output ?? null,
            errorJson: null,
            updatedAt: toDate(now),
          })
          .where(eq(mediaJobs.id, input.jobId))
          .returning()

        if (updated === undefined) {
          throw new MediaRepositoryError('DATABASE_ERROR', `Failed to complete media job: ${input.jobId}`)
        }

        return toMediaJob(updated)
      })
    },

    async failMediaJob(input) {
      const now = input.now ?? nowIso()
      const [row] = await db
        .update(mediaJobs)
        .set({
          // P2-06：瞬时失败重试时回到 queued（而不是 failed），这样重试 task
          // 重跑时 markMediaJobProcessing 仍能把它推进到 processing。
          status: input.retrying === true ? 'queued' : 'failed',
          errorJson: taskErrorJson(input.error),
          updatedAt: toDate(now),
        })
        .where(and(eq(mediaJobs.id, input.jobId), isNull(mediaJobs.deletedAt)))
        .returning()

      if (row === undefined) {
        throw new MediaRepositoryError('MEDIA_JOB_NOT_FOUND', `Media job not found: ${input.jobId}`)
      }

      return toMediaJob(row)
    },
  }
}
