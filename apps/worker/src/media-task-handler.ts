import {
  createMediaOutputAssetId,
  type MediaJob,
  type MediaRepository,
} from '@bailian-studio/media-repository'
import type { Logger } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import {
  createFfmpegMediaProcessor,
  type AudioFormat,
  type MediaProcessor,
} from './media-processor'
import type { TaskProcessOutcome } from './task-contracts'
import { readCarriedTaskError, taskErrorCarrier } from './task-error-guard'

export interface MediaTaskHandlerDeps {
  readonly mediaRepository?: MediaRepository
  readonly mediaProcessor?: MediaProcessor
  readonly storage: StorageAdapter
  readonly logger: Logger
}

export async function processMediaTask(
  task: TaskRecord,
  deps: MediaTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  let jobId: string
  try {
    jobId = readJobId(task)
  } catch (error) {
    return { status: 'failed', error: mediaTaskErrorFromThrown(error) }
  }
  const mediaRepository = deps.mediaRepository
  if (mediaRepository === undefined) {
    return {
      status: 'failed',
      error: {
        category: 'system',
        message: 'Media repository is not configured for media.process tasks',
        retriable: false,
        code: 'MEDIA_REPOSITORY_NOT_CONFIGURED',
      },
    }
  }

  const job = await mediaRepository.getMediaJobById(jobId)
  if (job === undefined) {
    deps.logger.warn('media.job_not_found', { taskId: task.id, traceId: task.traceId, jobId })
    return {
      status: 'failed',
      error: {
        category: 'validation',
        message: `Media job not found: ${jobId}`,
        retriable: false,
        code: 'MEDIA_JOB_NOT_FOUND',
      },
    }
  }

  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    deps.logger.warn('media.task.stale_terminal_job', { taskId: task.id, traceId: task.traceId, jobId, status: job.status })
    return {
      status: 'cancelled',
      error: {
        category: 'validation',
        message: `Media task is stale because job is already ${job.status}`,
        retriable: false,
        code: 'STALE_MEDIA_TASK',
      },
    }
  }

  try {
    await mediaRepository.markMediaJobProcessing(jobId, currentIso())
    const output = await runMediaOperation(task, job, mediaRepository, deps)
    deps.logger.info('media.task.succeeded', {
      taskId: task.id,
      traceId: task.traceId,
      jobId,
      outputAssetId: output.outputAssetId,
    })
    return {
      status: 'succeeded',
      output: {
        artifacts: [],
        raw: { mediaJobId: jobId, outputAssetId: output.outputAssetId },
      },
    }
  } catch (error) {
    const taskError = mediaTaskErrorFromThrown(error)
    deps.logger.error('media.task.failed', {
      taskId: task.id,
      traceId: task.traceId,
      jobId,
      errorCode: taskError.code,
      message: taskError.message,
    })
    await mediaRepository.failMediaJob({ jobId, error: taskError, now: currentIso() })
    return { status: 'failed', error: taskError }
  }
}

async function runMediaOperation(
  task: TaskRecord,
  job: MediaJob,
  mediaRepository: MediaRepository,
  deps: MediaTaskHandlerDeps,
): Promise<{ outputAssetId: string }> {
  if (job.operation !== 'video.extract_audio') {
    throw taskErrorCarrier({
      category: 'validation',
      message: `Unsupported media operation: ${job.operation}`,
      retriable: false,
      code: 'MEDIA_OPERATION_UNSUPPORTED',
    })
  }

  const options = readRecord(task.input['options'])
  const format = readAudioFormat(options['format'])
  const source = await mediaRepository.getMediaSource(job.id)
  if (source === undefined) {
    throw taskErrorCarrier({
      category: 'validation',
      message: `Media source asset not found for job: ${job.id}`,
      retriable: false,
      code: 'MEDIA_SOURCE_ASSET_NOT_FOUND',
    })
  }
  if (source.storageProvider !== deps.storage.provider) {
    throw taskErrorCarrier({
      category: 'system',
      message: `Media source storage provider mismatch: ${source.storageProvider} != ${deps.storage.provider}`,
      retriable: false,
      code: 'MEDIA_SOURCE_STORAGE_MISMATCH',
    })
  }
  const readObject = deps.storage.readObject
  if (readObject === undefined) {
    throw taskErrorCarrier({
      category: 'system',
      message: 'Media source storage does not support bounded reads',
      retriable: false,
      code: 'MEDIA_SOURCE_STORAGE_READ_UNAVAILABLE',
    })
  }
  const sourceFileName = readOptionalSourceFileName(job) ?? source.fileName
  const sourceObject = await readObject.call(deps.storage, { key: source.storageKey, maxBytes: source.byteSize })
  const processor = deps.mediaProcessor ?? createFfmpegMediaProcessor()
  const processed = await processor.extractAudio({
    jobId: job.id,
    sourceBody: sourceObject.body,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    format,
  })

  const outputAssetId = createMediaOutputAssetId(job.id, 'audio')
  const storageResult = await deps.storage.writeObject({
    key: `media-jobs/${job.id}/${outputAssetId}.${format}`,
    body: processed.body,
    contentType: processed.mimeType,
  })

  try {
    await mediaRepository.completeMediaJob({
      jobId: job.id,
      outputAsset: {
        id: outputAssetId,
        kind: 'audio',
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        byteSize: storageResult.byteSize,
        storageProvider: storageResult.provider,
        storageKey: storageResult.key,
        ...(storageResult.url !== undefined ? { storageUrl: storageResult.url } : {}),
        ...(processed.metadata !== undefined ? { metadata: processed.metadata } : {}),
      },
      output: {
        format,
        mimeType: processed.mimeType,
        fileName: processed.fileName,
        byteSize: storageResult.byteSize,
        storageKey: storageResult.key,
        ...(storageResult.url !== undefined ? { storageUrl: storageResult.url } : {}),
      },
      now: currentIso(),
    })
  } catch (error) {
    const deleteObject = deps.storage.deleteObject
    if (deleteObject !== undefined) {
      try {
        await deleteObject.call(deps.storage, { key: storageResult.key })
      } catch (cleanupError) {
        deps.logger.warn('media.output_cleanup_failed', {
          jobId: job.id,
          storageKey: storageResult.key,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }
    }
    throw error
  }

  return { outputAssetId }
}

function readJobId(task: TaskRecord): string {
  const value = task.input['jobId'] ?? task.recordId
  if (typeof value !== 'string' || value.length === 0) {
    throw taskErrorCarrier({
      category: 'validation',
      message: `Task ${task.id} is missing a string jobId in its input`,
      retriable: false,
      code: 'MEDIA_TASK_INVALID_INPUT',
    })
  }
  return value
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readAudioFormat(value: unknown): AudioFormat {
  if (value === undefined) return 'mp3'
  if (value === 'mp3' || value === 'wav') return value
  throw taskErrorCarrier({
    category: 'validation',
    message: `Unsupported audio format: ${String(value)}`,
    retriable: false,
    code: 'MEDIA_TASK_INVALID_FORMAT',
  })
}

function readOptionalSourceFileName(job: MediaJob): string | undefined {
  const source = job.input['source']
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined
  const fileName = (source as Record<string, unknown>)['fileName']
  return typeof fileName === 'string' && fileName.length > 0 ? fileName : undefined
}

function mediaTaskErrorFromThrown(error: unknown): TaskError {
  return readCarriedTaskError(error) ?? {
    category: 'system',
    message: error instanceof Error ? error.message : String(error),
    retriable: false,
    code: 'MEDIA_PROCESSING_FAILED',
  }
}

function currentIso(): string {
  return new Date().toISOString()
}
