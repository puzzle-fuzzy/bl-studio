import {
  GenerationRepositoryError,
  type AssetThumbnailSource,
  type GenerationRepository,
} from '@bailian-studio/generation-repository'
import type { Logger } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import { nextRunAt, type TaskError, type TaskRecord } from '@bailian-studio/task-engine'
import { ArtifactFetchError, fetchProviderArtifact } from './artifact-fetch'
import {
  DEFAULT_ARTIFACT_FETCH_MAX_BYTES,
  DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS,
  type ArtifactFetchPolicy,
} from './artifact-persist'
import type { MediaProcessor } from './media-processor'
import type { TaskProcessOutcome } from './task-contracts'
import { readCarriedTaskError, taskErrorCarrier } from './task-error-guard'

export interface ThumbnailTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly storage: StorageAdapter
  readonly mediaProcessor?: MediaProcessor
  readonly artifactFetch?: ArtifactFetchPolicy
  readonly logger: Logger
}

export async function processThumbnailTask(
  task: TaskRecord,
  deps: ThumbnailTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const derivativeId = readDerivativeId(task)
  if (derivativeId === undefined) {
    return {
      status: 'failed',
      error: thumbnailError('Thumbnail task is missing derivativeId', false, 'THUMBNAIL_TASK_INVALID_INPUT'),
    }
  }

  const source = await deps.repository.getAssetThumbnailSource(derivativeId)
  if (source === undefined) {
    return {
      status: 'failed',
      error: thumbnailError(`Thumbnail source not found: ${derivativeId}`, false, 'THUMBNAIL_SOURCE_NOT_FOUND'),
    }
  }
  if (source.status === 'ready') {
    return succeededThumbnailOutcome(source.assetId, derivativeId, true)
  }
  if (deps.mediaProcessor === undefined) {
    return {
      status: 'failed',
      error: thumbnailError('Media processor is not configured for thumbnail tasks', false, 'THUMBNAIL_PROCESSOR_NOT_CONFIGURED'),
    }
  }

  try {
    const markedProcessing = await deps.repository.markAssetThumbnailProcessing({
      derivativeId,
      now: currentIso(),
    })
    if (!markedProcessing) {
      const latest = await deps.repository.getAssetThumbnailSource(derivativeId)
      if (latest?.status === 'ready') {
        return succeededThumbnailOutcome(latest.assetId, derivativeId, true)
      }
      return {
        status: 'failed',
        error: thumbnailSourceUnavailableError(derivativeId),
      }
    }
    const payload = await readThumbnailSource(source, deps)
    const thumbnail = await deps.mediaProcessor.generateThumbnail({
      assetId: source.assetId,
      sourceBody: payload.body,
      sourceKind: source.kind,
      ...(source.fileName !== undefined ? { sourceFileName: source.fileName } : {}),
      ...(payload.contentType !== undefined
        ? { sourceMimeType: payload.contentType }
        : source.mimeType !== undefined ? { sourceMimeType: source.mimeType } : {}),
    })
    const stored = await deps.storage.writeObject({
      key: `asset-thumbnails/${source.assetId}/${derivativeId}.webp`,
      body: thumbnail.body,
      contentType: thumbnail.mimeType,
    })

    try {
      await deps.repository.completeAssetThumbnail({
        derivativeId,
        storageProvider: stored.provider,
        storageKey: stored.key,
        mimeType: thumbnail.mimeType,
        byteSize: stored.byteSize,
        metadata: { ...thumbnail.metadata },
        now: currentIso(),
      })
    } catch (error) {
      await compensateThumbnailWrite(deps.storage, stored.key, deps.logger, derivativeId)
      throw error
    }

    deps.logger.info('thumbnail.task.succeeded', {
      taskId: task.id,
      traceId: task.traceId,
      assetId: source.assetId,
      derivativeId,
      byteSize: stored.byteSize,
    })
    return succeededThumbnailOutcome(source.assetId, derivativeId, false)
  } catch (error) {
    const taskError = thumbnailErrorFromThrown(error)
    const retrying = taskError.retriable && task.attempts < task.maxAttempts
    try {
      await deps.repository.failAssetThumbnail({
        derivativeId,
        error: taskError as unknown as Record<string, unknown>,
        retrying,
        now: currentIso(),
      })
    } catch (stateError) {
      if (!isMissingDerivative(stateError)) throw stateError
      const unavailable = thumbnailSourceUnavailableError(derivativeId)
      deps.logger.info('thumbnail.task.source_unavailable', {
        taskId: task.id,
        traceId: task.traceId,
        assetId: source.assetId,
        derivativeId,
      })
      return { status: 'failed', error: unavailable }
    }
    deps.logger.error('thumbnail.task.failed', {
      taskId: task.id,
      traceId: task.traceId,
      assetId: source.assetId,
      derivativeId,
      errorCode: taskError.code,
      retriable: retrying,
    })
    return retrying
      ? { status: 'retry', error: taskError, nextRunAt: nextRunAt(currentIso(), task.attempts) }
      : { status: 'failed', error: taskError }
  }
}

async function readThumbnailSource(
  source: AssetThumbnailSource,
  deps: ThumbnailTaskHandlerDeps,
): Promise<{ body: Uint8Array; contentType?: string }> {
  const maxBytes = deps.artifactFetch?.maxBytes ?? DEFAULT_ARTIFACT_FETCH_MAX_BYTES
  if (source.storageProvider !== undefined || source.storageKey !== undefined) {
    if (source.storageProvider !== deps.storage.provider || source.storageKey === undefined) {
      throw taskErrorCarrier(thumbnailError(
        `Thumbnail source storage provider mismatch: ${source.storageProvider ?? 'missing'} != ${deps.storage.provider}`,
        false,
        'THUMBNAIL_STORAGE_MISMATCH',
      ))
    }
    if (deps.storage.readObject === undefined) {
      throw taskErrorCarrier(thumbnailError(
        'Thumbnail source storage does not support bounded reads',
        false,
        'THUMBNAIL_STORAGE_READ_UNAVAILABLE',
      ))
    }
    const object = await deps.storage.readObject({
      key: source.storageKey,
      maxBytes: Math.min(maxBytes, source.byteSize ?? maxBytes),
    })
    return {
      body: object.body,
      ...(object.contentType !== undefined ? { contentType: object.contentType } : {}),
    }
  }

  if (source.originalUrl === undefined) {
    throw taskErrorCarrier(thumbnailError(
      `Thumbnail source asset has no readable media: ${source.assetId}`,
      false,
      'THUMBNAIL_SOURCE_UNAVAILABLE',
    ))
  }
  const response = await fetchProviderArtifact({
    url: source.originalUrl,
    kind: source.kind,
    allowedHosts: deps.artifactFetch?.allowedHosts,
    maxBytes,
    timeoutMs: deps.artifactFetch?.timeoutMs ?? DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS,
    ...(deps.artifactFetch?.maxRedirects === undefined
      ? {}
      : { maxRedirects: deps.artifactFetch.maxRedirects }),
  })
  return { body: await response.consume(), contentType: response.contentType }
}

async function compensateThumbnailWrite(
  storage: StorageAdapter,
  storageKey: string,
  logger: Logger,
  derivativeId: string,
): Promise<void> {
  if (storage.deleteObject === undefined) return
  try {
    await storage.deleteObject({ key: storageKey })
  } catch (error) {
    logger.warn('thumbnail.output_cleanup_failed', {
      derivativeId,
      storageKey,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function readDerivativeId(task: TaskRecord): string | undefined {
  const value = task.input['derivativeId'] ?? task.recordId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function succeededThumbnailOutcome(
  assetId: string,
  derivativeId: string,
  reused: boolean,
): TaskProcessOutcome {
  return {
    status: 'succeeded',
    output: { artifacts: [], raw: { assetId, derivativeId, reused } },
  }
}

function thumbnailErrorFromThrown(error: unknown): TaskError {
  const carried = readCarriedTaskError(error)
  if (carried !== undefined) return carried
  if (error instanceof ArtifactFetchError) {
    const retriable = error.code === 'FETCH_FAILED' || error.code === 'TIMEOUT'
    return {
      category: error.code === 'TIMEOUT' ? 'timeout' : retriable ? 'network' : 'validation',
      message: error.message,
      retriable,
      code: `THUMBNAIL_${error.code}`,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    category: 'storage',
    message,
    retriable: /network|timeout|tempor|econn|fetch|http 5/i.test(message),
    code: 'THUMBNAIL_PROCESSING_FAILED',
  }
}

function thumbnailError(message: string, retriable: boolean, code: string): TaskError {
  return { category: 'system', message, retriable, code }
}

function thumbnailSourceUnavailableError(derivativeId: string): TaskError {
  return {
    category: 'cancelled',
    message: `Thumbnail source was deleted while processing: ${derivativeId}`,
    retriable: false,
    code: 'THUMBNAIL_SOURCE_DELETED',
  }
}

function isMissingDerivative(error: unknown): boolean {
  return error instanceof GenerationRepositoryError
    && error.code === 'ASSET_DERIVATIVE_NOT_FOUND'
}

function currentIso(): string {
  return new Date().toISOString()
}
