import { describe, expect, it } from 'vitest'
import type { MediaJob } from '@bailian-studio/media-repository'
import { processMediaTask } from '../src/media-task-handler'
import { createRecordingLogger, FakeStorageAdapter } from './fixtures'
import {
  FakeMediaRepository,
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
})
