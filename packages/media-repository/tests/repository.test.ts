import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mediaJobs, userAssets } from '@bailian-studio/db'
import { eq } from 'drizzle-orm'
import {
  MediaRepositoryError,
  createIsolatedMediaRepository,
  createMediaRepositoryFromUrl,
  createMediaTestUser,
  createMediaTestAsset,
  resetMediaRepositoryTestDb,
  type IsolatedMediaRepository,
} from '../src'

let iso!: IsolatedMediaRepository

beforeAll(async () => {
  iso = await createIsolatedMediaRepository()
})

afterAll(async () => {
  await iso.close()
})

async function expectRejects(fn: () => Promise<unknown>, code: string): Promise<void> {
  let caught: unknown
  try {
    await fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(MediaRepositoryError)
  expect(caught).toMatchObject({ code })
}

async function seedVideoAsset(userId: string, id = 'asset_video'): Promise<void> {
  await iso.db.insert(userAssets).values({
    id,
    userId,
    kind: 'video',
    source: 'upload',
    fileName: 'video.mp4',
    mimeType: 'video/mp4',
    byteSize: 10,
    storageProvider: 'local',
    storageKey: `user_uploads/${userId}/video.mp4`,
    storageUrl: null,
    metadataJson: {},
    status: 'ready',
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
    updatedAt: new Date('2026-07-09T00:00:00.000Z'),
  })
}

describe('media repository', () => {
  beforeEach(async () => {
    await resetMediaRepositoryTestDb(iso.db)
  })

  it('creates a queued media job and media.process task', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id)
    const result = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: {
        assetId: 'asset_video',
        kind: 'video',
        fileName: 'video.mp4',
      },
      now: '2026-07-09T00:00:00.000Z',
    })

    expect(result.job.status).toBe('queued')
    expect(result.job.operation).toBe('video.extract_audio')
    expect(result.job.input).toMatchObject({ options: { format: 'mp3' } })
    expect(result.task.type).toBe('media.process')
    expect(result.task.domain).toBe('media')
    expect(result.job.input).toEqual({
      source: { assetId: 'asset_video', kind: 'video', fileName: 'video.mp4' },
      options: { format: 'mp3' },
    })
    expect(result.task.input).toEqual({
      jobId: result.job.id,
      operation: 'video.extract_audio',
      options: { format: 'mp3' },
    })
    await expect(iso.repository.getMediaSource(result.job.id)).resolves.toEqual({
      storageProvider: 'local',
      storageKey: 'user_uploads/owner/video.mp4',
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      byteSize: 10,
    })
  })

  it('rejects a media job that has no owner-verified source asset', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })

    await expectRejects(() => iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'missing', kind: 'video' },
    }), 'MEDIA_SOURCE_ASSET_NOT_FOUND')
  })

  it('creates an idempotent multi-source assembly job and preserves source order', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'assembly-owner' })
    await createMediaTestAsset(iso.db, { id: 'assembly-video-1', userId: user.id, fileName: 'first.mp4', storageKey: 'videos/first.mp4' })
    await createMediaTestAsset(iso.db, { id: 'assembly-video-2', userId: user.id, fileName: 'second.mp4', storageKey: 'videos/second.mp4' })
    await createMediaTestAsset(iso.db, { id: 'assembly-music', userId: user.id, kind: 'audio', fileName: 'music.mp3', mimeType: 'audio/mpeg', storageKey: 'audio/music.mp3' })

    const input = {
      userId: user.id,
      operation: 'video.assemble' as const,
      source: { assetId: 'assembly-video-1', kind: 'video' as const, fileName: 'first.mp4' },
      assembly: {
        videoSources: [
          { assetId: 'assembly-video-1', kind: 'video' as const, fileName: 'first.mp4' },
          { assetId: 'assembly-video-2', kind: 'video' as const, fileName: 'second.mp4' },
        ],
        musicSource: { assetId: 'assembly-music', kind: 'audio' as const, fileName: 'music.mp3' },
      },
      options: { width: 720, height: 1280, fps: 24, audioVolume: 0.8 },
      idempotencyKey: 'director:run-1:assemble',
    }
    const first = await iso.repository.createMediaJob(input)
    const second = await iso.repository.createMediaJob(input)

    expect(second.job.id).toBe(first.job.id)
    expect(second.task.id).toBe(first.task.id)
    expect(first.job.input).toMatchObject({
      assembly: input.assembly,
      options: input.options,
      idempotencyKey: input.idempotencyKey,
    })
    expect(first.task.input).toMatchObject({ operation: 'video.assemble', options: input.options })
    await expect(iso.repository.getMediaSources(first.job.id)).resolves.toEqual([
      expect.objectContaining({ assetId: 'assembly-video-1', kind: 'video', fileName: 'first.mp4' }),
      expect.objectContaining({ assetId: 'assembly-video-2', kind: 'video', fileName: 'second.mp4' }),
      expect.objectContaining({ assetId: 'assembly-music', kind: 'audio', fileName: 'music.mp3' }),
    ])
  })

  it('rejects malformed stored assembly input instead of silently dropping sources', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'malformed-assembly-owner' })
    await seedVideoAsset(user.id, 'malformed-assembly-source')
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.assemble',
      source: { assetId: 'malformed-assembly-source', kind: 'video' },
      assembly: {
        videoSources: [{ assetId: 'malformed-assembly-source', kind: 'video' }],
      },
    })

    await iso.db
      .update(mediaJobs)
      .set({ inputJson: { assembly: { videoSources: [{ assetId: 'malformed-assembly-source', kind: 'unknown' }] } } })
      .where(eq(mediaJobs.id, created.job.id))

    await expect(iso.repository.getMediaSources(created.job.id))
      .rejects.toMatchObject({ code: 'DATABASE_ERROR' })
  })

  it('does not accept an asset id belonging to another user', async () => {
    const owner = await createMediaTestUser(iso.db, { id: 'owner' })
    const other = await createMediaTestUser(iso.db, { id: 'other' })
    await iso.db.insert(userAssets).values({
      id: 'asset_other_video',
      userId: other.id,
      kind: 'video',
      source: 'upload',
      fileName: 'other.mp4',
      mimeType: 'video/mp4',
      byteSize: 10,
      storageProvider: 'local',
      storageKey: 'user_uploads/other/other.mp4',
      storageUrl: null,
      metadataJson: {},
      status: 'ready',
      createdAt: new Date('2026-07-09T00:00:00.000Z'),
      updatedAt: new Date('2026-07-09T00:00:00.000Z'),
    })

    await expectRejects(() => iso.repository.createMediaJob({
      userId: owner.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_other_video', kind: 'video' },
    }), 'MEDIA_SOURCE_ASSET_NOT_FOUND')
  })

  it('returns only owned jobs', async () => {
    const owner = await createMediaTestUser(iso.db, { id: 'owner' })
    const other = await createMediaTestUser(iso.db, { id: 'other' })
    await seedVideoAsset(owner.id)
    const created = await iso.repository.createMediaJob({
      userId: owner.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_video', kind: 'video' },
    })

    expect(await iso.repository.getMediaJob({ userId: owner.id, jobId: created.job.id })).toMatchObject({ id: created.job.id })
    expect(await iso.repository.getMediaJob({ userId: other.id, jobId: created.job.id })).toBeUndefined()
  })

  it('marks a job processing', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id)
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_video', kind: 'video' },
    })

    const processing = await iso.repository.markMediaJobProcessing(created.job.id, '2026-07-09T00:01:00.000Z')
    expect(processing.status).toBe('processing')
    expect(processing.updatedAt).toBe('2026-07-09T00:01:00.000Z')
  })

  it('completes a job and creates an output user asset', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id, 'asset_source')
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_source', kind: 'video' },
    })

    const completed = await iso.repository.completeMediaJob({
      jobId: created.job.id,
      outputAsset: {
        id: 'asset_output',
        kind: 'audio',
        fileName: 'video.mp3',
        mimeType: 'audio/mpeg',
        byteSize: 123,
        storageProvider: 'local',
        storageKey: 'media-jobs/job/video.mp3',
        storageUrl: '/api/artifacts/local/media-jobs/job/video.mp3',
        metadata: { durationSeconds: 5 },
      },
      output: { durationSeconds: 5 },
      now: '2026-07-09T00:02:00.000Z',
    })

    expect(completed.status).toBe('succeeded')
    expect(completed.outputAssetId).toBe('asset_output')
    expect(completed.output).toEqual({ durationSeconds: 5 })

    const [asset] = await iso.db.select().from(userAssets).where(eq(userAssets.id, 'asset_output')).limit(1)
    expect(asset?.userId).toBe(user.id)
    expect(asset?.kind).toBe('audio')
    expect(asset?.source).toBe('derived')
    expect(asset?.metadataJson).toMatchObject({
      mediaJobId: created.job.id,
      sourceAssetId: 'asset_source',
      operation: 'video.extract_audio',
      durationSeconds: 5,
    })

    const retried = await iso.repository.completeMediaJob({
      jobId: created.job.id,
      outputAsset: {
        id: 'asset_output',
        kind: 'audio',
        fileName: 'video.mp3',
        mimeType: 'audio/mpeg',
        byteSize: 123,
        storageProvider: 'local',
        storageKey: 'media-jobs/job/video.mp3',
      },
      output: { durationSeconds: 5 },
      now: '2026-07-09T00:03:00.000Z',
    })
    expect(retried.status).toBe('succeeded')
    expect(retried.outputAssetId).toBe('asset_output')

    const outputAssets = await iso.db.select().from(userAssets).where(eq(userAssets.id, 'asset_output'))
    expect(outputAssets).toHaveLength(1)
  })

  it('serializes concurrent completion attempts for the same job', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id, 'asset_source')
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_source', kind: 'video' },
    })

    const completion = {
      jobId: created.job.id,
      outputAsset: {
        id: 'asset_output',
        kind: 'audio' as const,
        fileName: 'video.mp3',
        mimeType: 'audio/mpeg',
        byteSize: 123,
        storageProvider: 'local' as const,
        storageKey: 'media-jobs/job/video.mp3',
      },
      output: { durationSeconds: 5 },
      now: '2026-07-09T00:02:00.000Z',
    }

    const peerHandles = Array.from({ length: 7 }, () => createMediaRepositoryFromUrl(iso.databaseUrl))
    const peers = [iso.repository, ...peerHandles.map(handle => handle.repository)]
    try {
      const completions = await Promise.all(peers.map(peer => peer.completeMediaJob(completion)))

      expect(completions).toHaveLength(8)
      for (const result of completions) {
        expect(result.status).toBe('succeeded')
        expect(result.outputAssetId).toBe('asset_output')
      }
    } finally {
      await Promise.all(peerHandles.map(handle => handle.close()))
    }

    const outputAssets = await iso.db.select().from(userAssets).where(eq(userAssets.id, 'asset_output'))
    expect(outputAssets).toHaveLength(1)
  })

  it('marks a job failed with structured error', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id)
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_video', kind: 'video' },
    })

    const failed = await iso.repository.failMediaJob({
      jobId: created.job.id,
      error: { category: 'system', message: 'ffmpeg missing', retriable: false, code: 'FFMPEG_NOT_CONFIGURED' },
    })

    expect(failed.status).toBe('failed')
    expect(failed.error).toEqual({
      category: 'system',
      message: 'ffmpeg missing',
      retriable: false,
      code: 'FFMPEG_NOT_CONFIGURED',
    })
  })

  it('refuses to overwrite a succeeded job with failed (P1-30 terminal guard)', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id, 'asset_source')
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_source', kind: 'video' },
    })

    await iso.repository.completeMediaJob({
      jobId: created.job.id,
      outputAsset: {
        id: 'asset_output',
        kind: 'audio',
        fileName: 'video.mp3',
        mimeType: 'audio/mpeg',
        byteSize: 123,
        storageProvider: 'local',
        storageKey: 'media-jobs/job/video.mp3',
      },
      output: { durationSeconds: 5 },
    })

    await expectRejects(() => iso.repository.failMediaJob({
      jobId: created.job.id,
      error: { category: 'system', message: 'late failure', retriable: false, code: 'MEDIA_PROCESSING_FAILED' },
    }), 'MEDIA_JOB_ALREADY_COMPLETED')

    // succeeded 状态与 outputAssetId 保持不变。
    const after = await iso.repository.getMediaJobById(created.job.id)
    expect(after?.status).toBe('succeeded')
    expect(after?.outputAssetId).toBe('asset_output')
  })

  it('refuses to overwrite a cancelled job with failed (P1-30 terminal guard)', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await seedVideoAsset(user.id, 'asset_source')
    const created = await iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'asset_source', kind: 'video' },
    })

    // 直接置 cancelled（任务取消流之外无公开 repo 方法做此变更，测试里直改行即可）。
    await iso.db.update(mediaJobs).set({ status: 'cancelled' }).where(eq(mediaJobs.id, created.job.id))

    await expectRejects(() => iso.repository.failMediaJob({
      jobId: created.job.id,
      error: { category: 'system', message: 'late failure', retriable: false, code: 'MEDIA_PROCESSING_FAILED' },
    }), 'MEDIA_JOB_ALREADY_COMPLETED')

    const after = await iso.repository.getMediaJobById(created.job.id)
    expect(after?.status).toBe('cancelled')
  })

  it('rejects unsupported source kinds', async () => {
    const user = await createMediaTestUser(iso.db, { id: 'owner' })
    await expectRejects(() => iso.repository.createMediaJob({
      userId: user.id,
      operation: 'video.extract_audio',
      source: { assetId: 'missing', kind: 'image' },
    }), 'MEDIA_JOB_INVALID_OPERATION')
  })
})
