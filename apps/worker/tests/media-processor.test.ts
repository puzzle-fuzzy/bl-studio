import { describe, expect, it } from 'vitest'
import { FfmpegMediaProcessor, ffmpegThumbnailArgs, type FfmpegProcess } from '../src/media-processor'

describe('FfmpegMediaProcessor source boundary', () => {
  it('rejects a source body that exceeds the configured maximum before spawning ffmpeg', async () => {
    const processor = new FfmpegMediaProcessor({ ffmpegPath: 'ffmpeg-not-used', maxInputBytes: 2 })

    await expect(processor.extractAudio({
      jobId: 'media_job_1',
      sourceBody: new Uint8Array([1, 2, 3]),
      sourceFileName: 'video.mp4',
      format: 'mp3',
    })).rejects.toMatchObject({ taskError: { code: 'MEDIA_SOURCE_TOO_LARGE' } })
  })

  it('kills ffmpeg and returns a structured timeout when processing exceeds the deadline', async () => {
    let killed = false
    const processor = new FfmpegMediaProcessor({
      processTimeoutMs: 5,
      spawn: () => ({
        exited: new Promise<number>(() => {}),
        stderr: new ReadableStream<Uint8Array>(),
        kill: () => { killed = true },
      }) as FfmpegProcess,
    })

    await expect(processor.extractAudio({
      jobId: 'media_job_timeout',
      sourceBody: new Uint8Array([1]),
      sourceFileName: 'video.mp4',
      format: 'mp3',
    })).rejects.toMatchObject({ taskError: { code: 'MEDIA_PROCESS_TIMEOUT' } })
    expect(killed).toBe(true)
  })

  it('builds a bounded single-frame WebP thumbnail without audio', () => {
    const args = ffmpegThumbnailArgs('source.mp4', 'thumbnail.webp', 'video')

    expect(args).toContain('0.1')
    expect(args).toContain("scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease")
    expect(args).toContain('-frames:v')
    expect(args).toContain('-an')
    expect(args).toContain('libwebp')
    expect(args.at(-1)).toBe('thumbnail.webp')
  })

  it('rejects oversized thumbnail sources before spawning ffmpeg', async () => {
    let spawned = false
    const processor = new FfmpegMediaProcessor({
      maxInputBytes: 2,
      spawn: () => {
        spawned = true
        throw new Error('should not spawn')
      },
    })

    await expect(processor.generateThumbnail({
      assetId: 'asset_large',
      sourceBody: new Uint8Array([1, 2, 3]),
      sourceKind: 'image',
      sourceMimeType: 'image/png',
    })).rejects.toMatchObject({ taskError: { code: 'MEDIA_SOURCE_TOO_LARGE' } })
    expect(spawned).toBe(false)
  })
})
