import {
  createMediaOutputAssetId,
  type MediaJob,
  type MediaRepository,
} from '@bailian-studio/media-repository'
import type { Logger } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import { nextRunAt, type TaskError, type TaskRecord } from '@bailian-studio/task-engine'
import {
  createFfmpegMediaProcessor,
  type AudioFormat,
  type MediaProcessor,
} from './media-processor'
import type { TaskProcessOutcome } from './task-contracts'
import { readCarriedTaskError, taskErrorCarrier } from './task-error-guard'
import { isTransientFailure } from './transient-error'

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
    // P2-06：瞬时 OSS/网络故障不再直接永久失败——只要 attempts 未用尽就回到
    // 队列退避重试（failMediaJob retrying 会把 job 置回 queued）。
    const retrying = taskError.retriable && task.attempts < task.maxAttempts
    deps.logger.error('media.task.failed', {
      taskId: task.id,
      traceId: task.traceId,
      jobId,
      errorCode: taskError.code,
      message: taskError.message,
      retriable: retrying,
    })
    await mediaRepository.failMediaJob({ jobId, error: taskError, now: currentIso(), retrying })
    return retrying
      ? { status: 'retry', error: taskError, nextRunAt: nextRunAt(currentIso(), task.attempts) }
      : { status: 'failed', error: taskError }
  }
}

async function runMediaOperation(
  task: TaskRecord,
  job: MediaJob,
  mediaRepository: MediaRepository,
  deps: MediaTaskHandlerDeps,
): Promise<{ outputAssetId: string }> {
  if (job.operation !== 'video.extract_audio') {
    if (job.operation === 'video.assemble') {
      return runAssemblyVideoOperation(task, job, mediaRepository, deps)
    }
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

async function runAssemblyVideoOperation(
  task: TaskRecord,
  job: MediaJob,
  mediaRepository: MediaRepository,
  deps: MediaTaskHandlerDeps,
): Promise<{ outputAssetId: string }> {
  const processor = deps.mediaProcessor ?? createFfmpegMediaProcessor()
  if (processor.assembleVideo === undefined) {
    throw taskErrorCarrier({
      category: 'system',
      message: 'Media processor does not support video assembly',
      retriable: false,
      code: 'MEDIA_ASSEMBLY_UNSUPPORTED',
    })
  }
  const sources = await mediaRepository.getMediaSources(job.id)
  const videoSources = sources.filter(source => source.kind === 'video')
  const musicSource = sources.find(source => source.kind === 'audio')
  const planVideoCount = readAssemblyVideoCount(job)
  const planHasMusic = readAssemblyMusicExpected(job)
  if (videoSources.length === 0 || planVideoCount === undefined || videoSources.length !== planVideoCount || (planHasMusic && musicSource === undefined)) {
    throw taskErrorCarrier({
      category: 'validation',
      message: `Assembly media sources are incomplete for job: ${job.id}`,
      retriable: false,
      code: 'MEDIA_ASSEMBLY_INPUT_INVALID',
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
  const readSource = async (source: typeof sources[number]) => {
    if (source.storageProvider !== deps.storage.provider) {
      throw taskErrorCarrier({
        category: 'system',
        message: `Media source storage provider mismatch: ${source.storageProvider} != ${deps.storage.provider}`,
        retriable: false,
        code: 'MEDIA_SOURCE_STORAGE_MISMATCH',
      })
    }
    return readObject.call(deps.storage, { key: source.storageKey, maxBytes: source.byteSize })
  }
  const videoObjects = await Promise.all(videoSources.map(readSource))
  const musicObject = musicSource === undefined ? undefined : await readSource(musicSource)
  const options = readRecord(job.input['options'])
  const settings = assemblySettings(options)
  const processed = await processor.assembleVideo({
    jobId: job.id,
    videoSources: videoSources.map((source, index) => {
      const videoObject = videoObjects[index]
      if (videoObject === undefined) throw taskErrorCarrier({
        category: 'validation',
        message: `Assembly video source is missing for job: ${job.id}`,
        retriable: false,
        code: 'MEDIA_ASSEMBLY_INPUT_INVALID',
      })
      return {
        sourceBody: videoObject.body,
        sourceFileName: source.fileName,
        sourceMimeType: source.mimeType,
      }
    }),
    ...(musicSource === undefined || musicObject === undefined ? {} : {
      musicSource: {
        sourceBody: musicObject.body,
        sourceFileName: musicSource.fileName,
        sourceMimeType: musicSource.mimeType,
      },
    }),
    ...settings,
  })
  const outputAssetId = createMediaOutputAssetId(job.id, 'video')
  const storageResult = await deps.storage.writeObject({
    key: `media-jobs/${job.id}/${outputAssetId}.mp4`,
    body: processed.body,
    contentType: processed.mimeType,
  })
  try {
    await mediaRepository.completeMediaJob({
      jobId: job.id,
      outputAsset: {
        id: outputAssetId,
        kind: 'video',
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        byteSize: storageResult.byteSize,
        storageProvider: storageResult.provider,
        storageKey: storageResult.key,
        ...(storageResult.url !== undefined ? { storageUrl: storageResult.url } : {}),
        metadata: processed.metadata,
      },
      output: {
        ...processed.metadata,
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
  deps.logger.info('media.assembly.succeeded', { taskId: task.id, traceId: task.traceId, jobId: job.id, outputAssetId })
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

function assemblySettings(options: Record<string, unknown>): {
  width: number
  height: number
  fps: number
  audioVolume: number
} {
  const width = readIntegerOption(options.width, 1080)
  const height = readIntegerOption(options.height, 1920)
  const fps = readIntegerOption(options.fps, 30)
  const audioVolume = typeof options.audioVolume === 'number' ? options.audioVolume : 1
  return { width, height, fps, audioVolume }
}

function readAssemblyVideoCount(job: MediaJob): number | undefined {
  const assembly = readRecord(job.input['assembly'])
  const videoSources = assembly['videoSources']
  return Array.isArray(videoSources) ? videoSources.length : undefined
}

function readAssemblyMusicExpected(job: MediaJob): boolean {
  const assembly = readRecord(job.input['assembly'])
  return assembly['musicSource'] !== undefined
}

function readIntegerOption(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
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
    retriable: isTransientFailure(error),
    code: 'MEDIA_PROCESSING_FAILED',
  }
}

function currentIso(): string {
  return new Date().toISOString()
}
