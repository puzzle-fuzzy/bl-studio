import { describe, expect, it } from 'vitest'
import type { MediaJob } from '@bailian-studio/media-repository'
import { processMediaTask } from '../src/media-task-handler'
import { createRecordingLogger, FakeStorageAdapter } from './fixtures'
import {
  FakeMediaRepository,
  FakeMediaProcessor,
  makeMediaJob,
  makeMediaTask,
} from './media-fixtures'

describe('media task handler boundary', () => {
  it('returns a stable validation error for a missing media job id', async () => {
    await expect(processMediaTask(makeMediaTask({ input: {}, recordId: undefined }), {
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'MEDIA_TASK_INVALID_INPUT', category: 'validation' },
    })
  })

  it('rejects media tasks when the repository is not configured', async () => {
    await expect(processMediaTask(makeMediaTask(), {
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'MEDIA_REPOSITORY_NOT_CONFIGURED', category: 'system' },
    })
  })

  it('returns a stable validation error for an unknown media job', async () => {
    const repository = new FakeMediaRepository()
    await expect(processMediaTask(makeMediaTask({
      input: { jobId: 'missing_job' },
      recordId: 'missing_job',
    }), {
      mediaRepository: repository,
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'MEDIA_JOB_NOT_FOUND', category: 'validation' },
    })
  })

  it('cancels stale tasks that point to terminal media jobs', async () => {
    const repository = new FakeMediaRepository()
    repository.job = makeMediaJob({ status: 'succeeded' })
    await expect(processMediaTask(makeMediaTask(), {
      mediaRepository: repository,
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'STALE_MEDIA_TASK' },
    })
  })

  it('rejects unsupported audio formats before invoking a processor', async () => {
    const repository = new FakeMediaRepository()
    const outcome = await processMediaTask(makeMediaTask({
      input: {
        jobId: 'media_job_1',
        options: { format: 'aac' },
      },
    }), {
      mediaRepository: repository,
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: 'MEDIA_TASK_INVALID_FORMAT', category: 'validation' },
    })
    expect(repository.failed[0]?.error.code).toBe('MEDIA_TASK_INVALID_FORMAT')
  })

  it('rejects a media operation that has no registered handler', async () => {
    const repository = new FakeMediaRepository()
    repository.job = {
      ...makeMediaJob(),
      operation: 'video.trim',
    } as unknown as MediaJob

    await expect(processMediaTask(makeMediaTask(), {
      mediaRepository: repository,
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'MEDIA_OPERATION_UNSUPPORTED', category: 'validation' },
    })
  })

  it('assembles ordered video sources and optional music into a derived video asset', async () => {
    const repository = new FakeMediaRepository()
    repository.job = makeMediaJob({
      operation: 'video.assemble',
      sourceKind: 'video',
      input: {
        source: { assetId: 'asset_video_1', kind: 'video', fileName: 'shot-1.mp4' },
        assembly: {
          videoSources: [
            { assetId: 'asset_video_1', kind: 'video', fileName: 'shot-1.mp4' },
            { assetId: 'asset_video_2', kind: 'video', fileName: 'shot-2.mp4' },
          ],
          musicSource: { assetId: 'asset_music', kind: 'audio', fileName: 'music.mp3' },
        },
        options: { width: 1080, height: 1920, fps: 30, audioVolume: 0.8 },
      },
    })
    repository.compositeSources = [
      { assetId: 'asset_video_1', kind: 'video', storageProvider: 'local', storageKey: 'shot-1.mp4', fileName: 'shot-1.mp4', mimeType: 'video/mp4', byteSize: 10 },
      { assetId: 'asset_video_2', kind: 'video', storageProvider: 'local', storageKey: 'shot-2.mp4', fileName: 'shot-2.mp4', mimeType: 'video/mp4', byteSize: 10 },
      { assetId: 'asset_music', kind: 'audio', storageProvider: 'local', storageKey: 'music.mp3', fileName: 'music.mp3', mimeType: 'audio/mpeg', byteSize: 10 },
    ]
    const processor = new FakeMediaProcessor()

    const outcome = await processMediaTask(makeMediaTask({
      input: { jobId: 'media_job_1', operation: 'video.assemble', options: { width: 1080, height: 1920, fps: 30, audioVolume: 0.8 } },
    }), {
      mediaRepository: repository,
      mediaProcessor: processor,
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({ status: 'succeeded' })
    expect(processor.assemblyInputs[0]?.videoSources).toHaveLength(2)
    expect(processor.assemblyInputs[0]?.musicSource).toBeDefined()
    expect(repository.completed[0]).toMatchObject({ outputAsset: { kind: 'video', mimeType: 'video/mp4' } })
  })

  it('compensates the stored output when completion persistence fails', async () => {
    const repository = new FakeMediaRepository()
    repository.completeError = new Error('database unavailable')
    const storage = new FakeStorageAdapter()

    const outcome = await processMediaTask(makeMediaTask(), {
      mediaRepository: repository,
      mediaProcessor: {
        extractAudio: async () => ({ body: new Uint8Array([1]), fileName: 'video.mp3', mimeType: 'audio/mpeg' }),
        generateThumbnail: async () => ({
          body: new Uint8Array([1]),
          mimeType: 'image/webp',
          metadata: { format: 'webp', maxDimension: 640 },
        }),
      },
      storage,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({ status: 'failed', error: { code: 'MEDIA_PROCESSING_FAILED' } })
    expect(storage.deletes).toEqual(['media-jobs/media_job_1/asset_media_job_1_audio.mp3'])
  })

  it('retries transient storage failures instead of permanently failing', async () => {
    const repository = new FakeMediaRepository()
    const storage = new FakeStorageAdapter()
    storage.throwError = new Error('RequestTimeout: OSS upstream slow')

    const outcome = await processMediaTask(makeMediaTask(), {
      mediaRepository: repository,
      mediaProcessor: {
        extractAudio: async () => ({ body: new Uint8Array([1]), fileName: 'video.mp3', mimeType: 'audio/mpeg' }),
        generateThumbnail: async () => ({
          body: new Uint8Array([1]),
          mimeType: 'image/webp',
          metadata: { format: 'webp', maxDimension: 640 },
        }),
      },
      storage,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'retry',
      error: { code: 'MEDIA_PROCESSING_FAILED', retriable: true },
    })
    // 瞬时失败时 job 回到 queued（retrying），供重试 task 重新推进。
    expect(repository.failed[0]).toMatchObject({ retrying: true })
    expect(outcome.status === 'retry' && outcome.nextRunAt).toBeTruthy()
  })

  it('keeps permanent media failures non-retriable', async () => {
    const repository = new FakeMediaRepository()
    const storage = new FakeStorageAdapter()
    storage.throwError = new Error('Invalid audio payload')

    const outcome = await processMediaTask(makeMediaTask(), {
      mediaRepository: repository,
      mediaProcessor: {
        extractAudio: async () => ({ body: new Uint8Array([1]), fileName: 'video.mp3', mimeType: 'audio/mpeg' }),
        generateThumbnail: async () => ({
          body: new Uint8Array([1]),
          mimeType: 'image/webp',
          metadata: { format: 'webp', maxDimension: 640 },
        }),
      },
      storage,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({ status: 'failed', error: { retriable: false } })
    expect(repository.failed[0]).toMatchObject({ retrying: false })
  })
})
