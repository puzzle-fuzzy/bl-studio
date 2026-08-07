import { describe, expect, it } from 'vitest'
import { GenerationRepositoryError } from '@bailian-studio/generation-repository'
import { processThumbnailTask } from '../src/thumbnail-task-handler'
import { FakeMediaProcessor } from './media-fixtures'
import {
  FakeRepository,
  FakeStorageAdapter,
  createRecordingLogger,
  makeTask,
} from './fixtures'

describe('thumbnail task handler', () => {
  it('reads a local source with a bound, writes WebP, and completes the derivative', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_1', {
      derivativeId: 'asset_derivative_1',
      assetId: 'asset_video_1',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'user_uploads/user_1/video.mp4',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      byteSize: 3,
      status: 'queued',
    })
    const storage = new FakeStorageAdapter()
    const processor = new FakeMediaProcessor()

    const outcome = await processThumbnailTask(makeTask({
      id: 'task_thumbnail_1',
      type: 'media.thumbnail',
      domain: 'media',
      input: { assetId: 'asset_video_1', derivativeId: 'asset_derivative_1' },
      recordId: 'asset_derivative_1',
      attempts: 1,
    }), {
      repository,
      storage,
      mediaProcessor: processor,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'succeeded',
      output: { raw: { assetId: 'asset_video_1', derivativeId: 'asset_derivative_1', reused: false } },
    })
    expect(processor.thumbnailInputs[0]).toMatchObject({
      assetId: 'asset_video_1',
      sourceKind: 'video',
      sourceFileName: 'video.mp4',
      sourceMimeType: 'video/mp4',
    })
    expect(storage.writes[0]).toMatchObject({
      key: 'asset-thumbnails/asset_video_1/asset_derivative_1.webp',
      contentType: 'image/webp',
    })
    expect(repository.mutations.map(mutation => mutation.kind)).toEqual([
      'markAssetThumbnailProcessing',
      'completeAssetThumbnail',
    ])
  })

  it('rejects an unapproved link host before media processing', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_link', {
      derivativeId: 'asset_derivative_link',
      assetId: 'asset_link_1',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: 'https://unapproved.example.test/image.png',
      status: 'queued',
    })
    const processor = new FakeMediaProcessor()

    const outcome = await processThumbnailTask(makeTask({
      id: 'task_thumbnail_link',
      type: 'media.thumbnail',
      domain: 'media',
      input: { derivativeId: 'asset_derivative_link' },
      recordId: 'asset_derivative_link',
      attempts: 1,
    }), {
      repository,
      storage: new FakeStorageAdapter(),
      mediaProcessor: processor,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: 'THUMBNAIL_HOST_REJECTED', retriable: false },
    })
    expect(processor.thumbnailInputs).toHaveLength(0)
    expect(repository.mutations.at(-1)).toMatchObject({
      kind: 'failAssetThumbnail',
      input: { retrying: false },
    })
  })

  it('treats an already-ready derivative as an idempotent success', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_ready', {
      derivativeId: 'asset_derivative_ready',
      assetId: 'asset_ready',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'uploads/ready.png',
      status: 'ready',
    })

    const outcome = await processThumbnailTask(makeTask({
      type: 'media.thumbnail',
      domain: 'media',
      input: { derivativeId: 'asset_derivative_ready' },
      recordId: 'asset_derivative_ready',
    }), {
      repository,
      storage: new FakeStorageAdapter(),
      mediaProcessor: new FakeMediaProcessor(),
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({ status: 'succeeded', output: { raw: { reused: true } } })
    expect(repository.mutations).toHaveLength(0)
  })

  it('compensates output and finishes cleanly when the source is deleted during processing', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_deleted', {
      derivativeId: 'asset_derivative_deleted',
      assetId: 'asset_deleted',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'uploads/deleted.png',
      status: 'queued',
    })
    repository.completeAssetThumbnail = () => Promise.reject(new GenerationRepositoryError(
      'ASSET_DERIVATIVE_NOT_FOUND',
      'deleted during processing',
    ))
    repository.failAssetThumbnail = () => Promise.reject(new GenerationRepositoryError(
      'ASSET_DERIVATIVE_NOT_FOUND',
      'deleted during processing',
    ))
    const storage = new FakeStorageAdapter()

    const outcome = await processThumbnailTask(makeTask({
      type: 'media.thumbnail',
      domain: 'media',
      input: { derivativeId: 'asset_derivative_deleted' },
      recordId: 'asset_derivative_deleted',
    }), {
      repository,
      storage,
      mediaProcessor: new FakeMediaProcessor(),
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { category: 'cancelled', code: 'THUMBNAIL_SOURCE_DELETED', retriable: false },
    })
    expect(storage.deletes).toEqual([
      'asset-thumbnails/asset_deleted/asset_derivative_deleted.webp',
    ])
  })

  it('retries transient media processing failures (network jitter) instead of permanently failing', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_transient', {
      derivativeId: 'asset_derivative_transient',
      assetId: 'asset_video_transient',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'user_uploads/user_1/video.mp4',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      byteSize: 3,
      status: 'queued',
    })
    const processor = new FakeMediaProcessor()
    processor.throwError = new Error('fetch failed: ECONNRESET')

    const outcome = await processThumbnailTask(makeTask({
      type: 'media.thumbnail',
      domain: 'media',
      input: { assetId: 'asset_video_transient', derivativeId: 'asset_derivative_transient' },
      recordId: 'asset_derivative_transient',
      attempts: 1,
      maxAttempts: 3,
    }), {
      repository,
      storage: new FakeStorageAdapter(),
      mediaProcessor: processor,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'retry',
      error: { code: 'THUMBNAIL_PROCESSING_FAILED', retriable: true },
    })
    expect(repository.mutations.at(-1)).toMatchObject({
      kind: 'failAssetThumbnail',
      input: { retrying: true },
    })
  })

  it('keeps permanent thumbnail failures non-retriable', async () => {
    const repository = new FakeRepository()
    repository.thumbnailSources.set('asset_derivative_perm', {
      derivativeId: 'asset_derivative_perm',
      assetId: 'asset_video_perm',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'user_uploads/user_1/video.mp4',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      byteSize: 3,
      status: 'queued',
    })
    const processor = new FakeMediaProcessor()
    processor.throwError = new Error('Invalid video stream data')

    const outcome = await processThumbnailTask(makeTask({
      type: 'media.thumbnail',
      domain: 'media',
      input: { assetId: 'asset_video_perm', derivativeId: 'asset_derivative_perm' },
      recordId: 'asset_derivative_perm',
      attempts: 1,
      maxAttempts: 3,
    }), {
      repository,
      storage: new FakeStorageAdapter(),
      mediaProcessor: processor,
      logger: createRecordingLogger(),
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: 'THUMBNAIL_PROCESSING_FAILED', retriable: false },
    })
    expect(repository.mutations.at(-1)).toMatchObject({
      kind: 'failAssetThumbnail',
      input: { retrying: false },
    })
  })
})
