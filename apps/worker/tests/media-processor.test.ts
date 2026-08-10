import { describe, expect, it } from 'vitest'
import { FfmpegMediaProcessor, ffmpegAssemblyArgs, ffmpegThumbnailArgs, type FfmpegProcess } from '../src/media-processor'

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

  it('builds a multi-source assembly command with optional looped music', () => {
    const args = ffmpegAssemblyArgs(
      ['shot-1.mp4', 'shot-2.mp4'],
      'music.mp3',
      'assembled.mp4',
      { width: 1080, height: 1920, fps: 30, audioVolume: 0.75 },
    )

    expect(args).toContain('-stream_loop')
    expect(args).toContain('-1')
    expect(args).toContain('music.mp3')
    expect(args.join('\n')).toContain('[v0][v1]concat=n=2:v=1:a=0[outv]')
    expect(args).toContain('-map')
    expect(args).toContain('[outv]')
    expect(args).toContain('volume=0.75')
    expect(args.at(-1)).toBe('assembled.mp4')
  })

  it('rejects assembly input that exceeds the aggregate byte limit before spawning ffmpeg', async () => {
    let spawned = false
    const processor = new FfmpegMediaProcessor({
      maxAssemblyInputBytes: 2,
      spawn: () => {
        spawned = true
        throw new Error('should not spawn')
      },
    })

    await expect(processor.assembleVideo({
      jobId: 'media_job_assembly_large',
      videoSources: [
        { sourceBody: new Uint8Array([1, 2]), sourceFileName: 'shot-1.mp4' },
        { sourceBody: new Uint8Array([3]), sourceFileName: 'shot-2.mp4' },
      ],
      width: 1080,
      height: 1920,
      fps: 30,
      audioVolume: 1,
    })).rejects.toMatchObject({ taskError: { code: 'MEDIA_ASSEMBLY_INPUT_TOO_LARGE' } })
    expect(spawned).toBe(false)
  })

  it('spawns ffmpeg detached so timeout kills cover the whole process group (P1-25)', async () => {
    let receivedOptions: { stdout: 'pipe'; stderr: 'pipe'; detached?: boolean } | undefined
    const processor = new FfmpegMediaProcessor({
      spawn: (_command, options) => {
        receivedOptions = options
        return {
          exited: Promise.resolve(1),
          stderr: new ReadableStream<Uint8Array>({ start(controller) { controller.close() } }),
          kill: () => {},
        } as FfmpegProcess
      },
    })

    // exit 1 → 处理器抛结构化 FFMPEG_FAILED，不尝试读输出文件。
    await processor.extractAudio({
      jobId: 'media_job_detached',
      sourceBody: new Uint8Array([1]),
      sourceFileName: 'video.mp4',
      format: 'wav',
    }).then(
      () => { throw new Error('expected ffmpeg failure') },
      () => {},
    )

    expect(receivedOptions?.detached).toBe(true)
  })

  it('keeps only a bounded tail of ffmpeg stderr instead of buffering it all (P1-25)', async () => {
    const headMarker = 'HEAD-MARKER-DISTINCTIVE'
    const tailMarker = 'TAIL-MARKER-DISTINCTIVE'
    const stderrBytes = new TextEncoder().encode(`${headMarker}${'B'.repeat(20 * 1024)}${tailMarker}\n`)
    const processor = new FfmpegMediaProcessor({
      spawn: () => ({
        exited: Promise.resolve(1),
        stderr: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(stderrBytes); controller.close() } }),
        kill: () => {},
      }) as FfmpegProcess,
    })

    const error = await processor.extractAudio({
      jobId: 'media_job_stderr',
      sourceBody: new Uint8Array([1]),
      sourceFileName: 'video.mp4',
      format: 'mp3',
    }).then(
      () => { throw new Error('expected ffmpeg failure') },
      err => err as { taskError: { code: string; message: string } },
    )

    expect(error.taskError.code).toBe('FFMPEG_FAILED')
    expect(error.taskError.message).toContain(tailMarker)
    // 20KB 头部内容被截断：头部标记不应残留在 16KB 尾部里。
    expect(error.taskError.message).not.toContain(headMarker)
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
