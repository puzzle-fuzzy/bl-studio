import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { mediaJobs, userAssets, type BailianStudioDb } from '@bailian-studio/db'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type { TaskQueueTransactionStore } from '@bailian-studio/task-repository'
import { createMediaJobId, createMediaTaskId } from './id'
import { MediaRepositoryError } from './errors'
import { toMediaJob } from './mappers'
import type {
  CompleteMediaJobInput,
  CreateMediaJobInput,
  CreateMediaJobResult,
  FailMediaJobInput,
  GetMediaJobInput,
  MediaJob,
  MediaCompositeSource,
  MediaSource,
} from './types'

export interface CreateMediaRepositoryOptions {
  db: BailianStudioDb
  taskQueueTransactionStore: TaskQueueTransactionStore
}

export interface MediaRepository {
  createMediaJob(input: CreateMediaJobInput): Promise<CreateMediaJobResult>
  getMediaJob(input: GetMediaJobInput): Promise<MediaJob | undefined>
  getMediaJobById(jobId: string): Promise<MediaJob | undefined>
  getMediaSource(jobId: string): Promise<MediaSource | undefined>
  getMediaSources(jobId: string): Promise<MediaCompositeSource[]>
  markMediaJobProcessing(jobId: string, now?: string): Promise<MediaJob>
  completeMediaJob(input: CompleteMediaJobInput): Promise<MediaJob>
  failMediaJob(input: FailMediaJobInput): Promise<MediaJob>
}

interface AssemblySourceReference {
  assetId: string
  kind: 'video' | 'audio'
  fileName?: string
}

interface AssemblyInput {
  videoSources: AssemblySourceReference[]
  musicSource?: AssemblySourceReference
}

function readAssemblyInput(value: unknown): AssemblyInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const videoSources = Array.isArray(record.videoSources)
    ? record.videoSources.flatMap(item => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
        const source = item as Record<string, unknown>
        return typeof source.assetId === 'string' && source.kind === 'video'
          ? [{ assetId: source.assetId, kind: 'video' as const, ...(typeof source.fileName === 'string' ? { fileName: source.fileName } : {}) }]
          : []
      })
    : []
  const musicValue = record.musicSource
  let musicSource: AssemblySourceReference | undefined
  if (typeof musicValue === 'object' && musicValue !== null && !Array.isArray(musicValue)) {
    const source = musicValue as Record<string, unknown>
    if (typeof source.assetId === 'string' && source.kind === 'audio') {
      musicSource = { assetId: source.assetId, kind: 'audio', ...(typeof source.fileName === 'string' ? { fileName: source.fileName } : {}) }
    }
  }
  return { videoSources, ...(musicSource === undefined ? {} : { musicSource }) }
}

function nowIso(): string {
  return new Date().toISOString()
}

function toDate(value: string): Date {
  return new Date(value)
}

// P1-C：任务序列化与写入已统一到 @bailian-studio/task-repository

function taskErrorJson(error: NonNullable<TaskRecord['errorJson']>): Record<string, unknown> {
  return {
    category: error.category,
    message: error.message,
    retriable: error.retriable,
    ...(error.code !== undefined ? { code: error.code } : {}),
  }
}

function validateCreateInput(input: CreateMediaJobInput): void {
  if (input.operation !== 'video.extract_audio' && input.operation !== 'video.assemble') {
    throw new MediaRepositoryError('MEDIA_JOB_INVALID_OPERATION', `Unsupported media operation: ${input.operation}`)
  }
  if (input.source.kind !== 'video') {
    throw new MediaRepositoryError('MEDIA_JOB_INVALID_OPERATION', 'video.extract_audio requires a video source')
  }
  if (input.source.assetId.trim().length === 0) {
    throw new MediaRepositoryError('MEDIA_SOURCE_ASSET_NOT_FOUND', 'Media source asset is required')
  }
  if (input.operation === 'video.assemble') {
    const videos = input.assembly?.videoSources ?? []
    if (videos.length === 0 || videos.length > 500 || videos.some(source => source.assetId.trim().length === 0)) {
      throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'video.assemble requires between 1 and 500 video sources')
    }
    if (videos[0]?.assetId !== input.source.assetId) {
      throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'The primary media source must be the first assembly video')
    }
    if (new Set(videos.map(source => source.assetId)).size !== videos.length) {
      throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'Assembly video sources must be unique')
    }
    if (input.assembly?.musicSource?.assetId !== undefined && input.assembly.musicSource.assetId.trim().length === 0) {
      throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'Assembly music source is invalid')
    }
  } else if (input.assembly !== undefined) {
    throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'Assembly input is only valid for video.assemble')
  }
}

function defaultOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  return { format: 'mp3', ...(options ?? {}) }
}

function operationOptions(operation: CreateMediaJobInput['operation'], options: Record<string, unknown> | undefined): Record<string, unknown> {
  return operation === 'video.assemble' ? { ...(options ?? {}) } : defaultOptions(options)
}

export function createMediaRepository(options: CreateMediaRepositoryOptions): MediaRepository {
  const { db, taskQueueTransactionStore } = options

  return {
    async createMediaJob(input) {
      validateCreateInput(input)
      const now = input.now ?? nowIso()
      const jobId = createMediaJobId()
      const traceId = input.traceId ?? crypto.randomUUID()
      return db.transaction(async tx => {
        if (input.idempotencyKey !== undefined) {
          const [existingJob] = await tx
            .select()
            .from(mediaJobs)
            .where(and(
              eq(mediaJobs.userId, input.userId),
              eq(mediaJobs.operation, input.operation),
              isNull(mediaJobs.deletedAt),
              sql`${mediaJobs.inputJson}->>'idempotencyKey' = ${input.idempotencyKey}`,
            ))
            .limit(1)
          if (existingJob !== undefined) {
            const existingTask = await taskQueueTransactionStore.findTask(tx, {
              recordId: existingJob.id,
              type: 'media.process',
            })
            if (existingTask === undefined) throw new MediaRepositoryError('DATABASE_ERROR', `Media task missing for idempotent job: ${existingJob.id}`)
            return { job: toMediaJob(existingJob), task: existingTask }
          }
        }
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
          ...(input.assembly === undefined ? {} : { assembly: input.assembly }),
          options: operationOptions(input.operation, input.options),
          ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
        }

        if (input.operation === 'video.assemble') {
          const assembly = input.assembly
          if (assembly === undefined) {
            throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'Assembly input is required for video.assemble')
          }
          const sourceIds = [
            ...assembly.videoSources.map(source => source.assetId),
            ...(assembly.musicSource === undefined ? [] : [assembly.musicSource.assetId]),
          ]
          const sourceRows = await tx
            .select({ id: userAssets.id, kind: userAssets.kind })
            .from(userAssets)
            .where(and(
              eq(userAssets.userId, input.userId),
              inArray(userAssets.id, sourceIds),
              isNull(userAssets.deletedAt),
              eq(userAssets.status, 'ready'),
            ))
          const sourceKinds = new Map(sourceRows.map(row => [row.id, row.kind]))
          const missing = sourceIds.find(id => sourceKinds.get(id) === undefined)
          if (missing !== undefined) {
            throw new MediaRepositoryError('MEDIA_SOURCE_ASSET_NOT_FOUND', `Media source asset not found: ${missing}`)
          }
          if (assembly.videoSources.some(source => sourceKinds.get(source.assetId) !== 'video')) {
            throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'Every assembly video source must be a ready video asset')
          }
          if (assembly.musicSource !== undefined && sourceKinds.get(assembly.musicSource.assetId) !== 'audio') {
            throw new MediaRepositoryError('MEDIA_ASSEMBLY_INPUT_INVALID', 'The assembly music source must be a ready audio asset')
          }
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
            options: operationOptions(input.operation, input.options),
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

        const taskRow = await taskQueueTransactionStore.enqueueTask(tx, task)

        return { job: toMediaJob(jobRow), task: taskRow }
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

    async getMediaSources(jobId): Promise<MediaCompositeSource[]> {
      const [job] = await db
        .select({ userId: mediaJobs.userId, input: mediaJobs.inputJson })
        .from(mediaJobs)
        .where(and(eq(mediaJobs.id, jobId), isNull(mediaJobs.deletedAt)))
        .limit(1)
      if (job === undefined) return []
      const assembly = readAssemblyInput(job.input['assembly'])
      if (assembly === undefined) return []
      const refs = [
        ...assembly.videoSources,
        ...(assembly.musicSource === undefined ? [] : [assembly.musicSource]),
      ]
      if (refs.length === 0) return []
      const rows = await db
        .select({
          id: userAssets.id,
          kind: userAssets.kind,
          storageProvider: userAssets.storageProvider,
          storageKey: userAssets.storageKey,
          fileName: userAssets.fileName,
          mimeType: userAssets.mimeType,
          byteSize: userAssets.byteSize,
        })
        .from(userAssets)
        .where(and(
          eq(userAssets.userId, job.userId),
          inArray(userAssets.id, refs.map(ref => ref.assetId)),
          eq(userAssets.status, 'ready'),
          isNull(userAssets.deletedAt),
        ))
      const byId = new Map(rows.map(row => [row.id, row]))
      return refs.flatMap(ref => {
        const row = byId.get(ref.assetId)
        if (row === undefined || row.storageProvider === null || row.storageKey === null || row.fileName === null || row.mimeType === null || row.byteSize === null) return []
        return [{
          assetId: row.id,
          kind: row.kind as MediaCompositeSource['kind'],
          storageProvider: row.storageProvider,
          storageKey: row.storageKey,
          fileName: ref.fileName ?? row.fileName,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
        }]
      })
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
      // P1-30：与 completeMediaJob 对称的终态守卫——succeeded/cancelled 不可被失败
      // 覆盖（防止迟到失败回调把已完成任务的 outputAssetId 语义破坏）。已 failed 的
      // 任务重复 fail（或 retrying 回 queued）仍是幂等无害的，故不在 NOT IN 之列。
      const [row] = await db
        .update(mediaJobs)
        .set({
          // P2-06：瞬时失败重试时回到 queued（而不是 failed），这样重试 task
          // 重跑时 markMediaJobProcessing 仍能把它推进到 processing。
          status: input.retrying === true ? 'queued' : 'failed',
          errorJson: taskErrorJson(input.error),
          updatedAt: toDate(now),
        })
        .where(and(
          eq(mediaJobs.id, input.jobId),
          isNull(mediaJobs.deletedAt),
          notInArray(mediaJobs.status, ['succeeded', 'cancelled']),
        ))
        .returning()

      if (row === undefined) {
        const [existing] = await db
          .select({ status: mediaJobs.status })
          .from(mediaJobs)
          .where(and(eq(mediaJobs.id, input.jobId), isNull(mediaJobs.deletedAt)))
          .limit(1)
        if (existing === undefined) {
          throw new MediaRepositoryError('MEDIA_JOB_NOT_FOUND', `Media job not found: ${input.jobId}`)
        }
        throw new MediaRepositoryError('MEDIA_JOB_ALREADY_COMPLETED', `Media job is terminal: ${input.jobId}`)
      }

      return toMediaJob(row)
    },
  }
}
