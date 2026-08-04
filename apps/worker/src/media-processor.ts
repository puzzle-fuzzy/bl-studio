import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { spawnProcess } from '@bailian-studio/shared'

export type AudioFormat = 'mp3' | 'wav'

export interface ExtractAudioInput {
  jobId: string
  sourceBody: Uint8Array
  sourceFileName?: string
  format: AudioFormat
}

export interface ExtractAudioOutput {
  body: Uint8Array
  fileName: string
  mimeType: string
  metadata?: Record<string, unknown>
}

export interface GenerateThumbnailInput {
  assetId: string
  sourceBody: Uint8Array
  sourceKind: 'image' | 'video'
  sourceFileName?: string
  sourceMimeType?: string
}

export interface GenerateThumbnailOutput {
  body: Uint8Array
  mimeType: 'image/webp'
  metadata: Readonly<{ format: 'webp'; maxDimension: number }>
}

export interface MediaProcessor {
  extractAudio(input: ExtractAudioInput): Promise<ExtractAudioOutput>
  generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailOutput>
}

export interface FfmpegMediaProcessorOptions {
  ffmpegPath?: string
  maxInputBytes?: number
  processTimeoutMs?: number
  maxThumbnailOutputBytes?: number
  spawn?: FfmpegSpawn
}

export interface FfmpegProcess {
  exited: Promise<number>
  stderr: ReadableStream<Uint8Array>
  kill(): void
}

export type FfmpegSpawn = (
  command: string[],
  options: { stdout: 'pipe'; stderr: 'pipe' },
) => FfmpegProcess

export class FfmpegMediaProcessor implements MediaProcessor {
  private readonly ffmpegPath: string
  private readonly maxInputBytes: number
  private readonly processTimeoutMs: number
  private readonly maxThumbnailOutputBytes: number
  private readonly spawn: FfmpegSpawn

  constructor(options: FfmpegMediaProcessorOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.maxInputBytes = options.maxInputBytes ?? 100 * 1024 * 1024
    this.processTimeoutMs = options.processTimeoutMs ?? 5 * 60 * 1000
    this.maxThumbnailOutputBytes = options.maxThumbnailOutputBytes ?? 5 * 1024 * 1024
    this.spawn = options.spawn ?? ((command, spawnOptions) => spawnProcess(command, spawnOptions))
  }

  async extractAudio(input: ExtractAudioInput): Promise<ExtractAudioOutput> {
    const body = await this.processWithFfmpeg({
      workId: input.jobId,
      sourceBody: input.sourceBody,
      sourceFileName: input.sourceFileName,
      outputFileName: `audio.${input.format}`,
      buildArgs: (inputPath, outputPath) => ffmpegExtractArgs(inputPath, outputPath, input.format),
    })
    return {
      body,
      fileName: outputFileName(input.sourceFileName, input.format),
      mimeType: mimeTypeForAudioFormat(input.format),
    }
  }

  async generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailOutput> {
    const body = await this.processWithFfmpeg({
      workId: input.assetId,
      sourceBody: input.sourceBody,
      sourceFileName: input.sourceFileName,
      sourceMimeType: input.sourceMimeType,
      outputFileName: 'thumbnail.webp',
      maxOutputBytes: this.maxThumbnailOutputBytes,
      buildArgs: (inputPath, outputPath) => ffmpegThumbnailArgs(inputPath, outputPath, input.sourceKind),
    })
    return {
      body,
      mimeType: 'image/webp',
      metadata: { format: 'webp', maxDimension: 640 },
    }
  }

  private async processWithFfmpeg(input: {
    workId: string
    sourceBody: Uint8Array
    sourceFileName?: string
    sourceMimeType?: string
    outputFileName: string
    maxOutputBytes?: number
    buildArgs(inputPath: string, outputPath: string): string[]
  }): Promise<Uint8Array> {
    this.assertValidLimits(input.sourceBody, input.maxOutputBytes)
    const workDir = join(tmpdir(), `bailian-studio-media-${input.workId}-${crypto.randomUUID()}`)
    const inputPath = join(workDir, `source${sourceExtension(input.sourceFileName, input.sourceMimeType)}`)
    const outputPath = join(workDir, input.outputFileName)

    try {
      await mkdir(workDir, { recursive: true })
      await writeFile(inputPath, input.sourceBody)
      const proc = this.spawn([this.ffmpegPath, ...input.buildArgs(inputPath, outputPath)], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          Promise.all([proc.exited, new Response(proc.stderr).text()]).then(([exitCode, stderr]) => ({ exitCode, stderr })),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              proc.kill()
              reject(mediaProcessingError(`ffmpeg exceeded ${this.processTimeoutMs}ms`, 'MEDIA_PROCESS_TIMEOUT'))
            }, this.processTimeoutMs)
          }),
        ])
        if (result.exitCode !== 0) {
          throw mediaProcessingError(
            `ffmpeg failed with exit code ${result.exitCode}: ${result.stderr.trim() || 'no stderr output'}`,
            'FFMPEG_FAILED',
          )
        }
        const body = new Uint8Array(await readFile(outputPath))
        if (input.maxOutputBytes !== undefined && body.byteLength > input.maxOutputBytes) {
          throw mediaProcessingError(
            `Media output exceeds the configured byte limit: ${body.byteLength} > ${input.maxOutputBytes}`,
            'MEDIA_OUTPUT_TOO_LARGE',
          )
        }
        return body
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
    } catch (error) {
      if (isTaskErrorCarrier(error)) throw error
      throw mediaProcessingError(error instanceof Error ? error.message : String(error), 'MEDIA_PROCESSING_FAILED')
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  private assertValidLimits(sourceBody: Uint8Array, maxOutputBytes?: number): void {
    if (!Number.isSafeInteger(this.maxInputBytes) || this.maxInputBytes <= 0) {
      throw mediaProcessingError('Media input limit must be a positive integer', 'MEDIA_PROCESSOR_INVALID_CONFIG')
    }
    if (maxOutputBytes !== undefined && (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0)) {
      throw mediaProcessingError('Media output limit must be a positive integer', 'MEDIA_PROCESSOR_INVALID_CONFIG')
    }
    if (sourceBody.byteLength > this.maxInputBytes) {
      throw mediaProcessingError(
        `Media source exceeds the configured byte limit: ${sourceBody.byteLength} > ${this.maxInputBytes}`,
        'MEDIA_SOURCE_TOO_LARGE',
      )
    }
  }
}

export function createFfmpegMediaProcessor(options?: FfmpegMediaProcessorOptions): MediaProcessor {
  return new FfmpegMediaProcessor(options)
}

function ffmpegExtractArgs(inputPath: string, outputPath: string, format: AudioFormat): string[] {
  if (format === 'wav') {
    return ['-y', '-i', inputPath, '-vn', '-acodec', 'pcm_s16le', outputPath]
  }
  return ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputPath]
}

export function ffmpegThumbnailArgs(
  inputPath: string,
  outputPath: string,
  sourceKind: 'image' | 'video',
): string[] {
  return [
    '-y',
    ...(sourceKind === 'video' ? ['-ss', '0.1'] : []),
    '-i', inputPath,
    '-vf', "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease",
    '-frames:v', '1',
    '-an',
    '-c:v', 'libwebp',
    '-quality', '78',
    '-compression_level', '4',
    outputPath,
  ]
}

function sourceExtension(fileName: string | undefined, mimeType?: string): string {
  const extension = extname(fileName ?? 'source.bin')
  if (extension.length > 0 && extension !== '.bin') return extension
  const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase()
  if (normalizedMime === 'image/png') return '.png'
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') return '.jpg'
  if (normalizedMime === 'image/webp') return '.webp'
  if (normalizedMime === 'image/gif') return '.gif'
  if (normalizedMime === 'video/mp4') return '.mp4'
  if (normalizedMime === 'video/webm') return '.webm'
  if (normalizedMime === 'video/quicktime') return '.mov'
  if (normalizedMime === 'video/x-matroska') return '.mkv'
  return '.bin'
}

function outputFileName(sourceFileName: string | undefined, format: AudioFormat): string {
  const name = sourceFileName === undefined ? 'audio' : basename(sourceFileName, extname(sourceFileName))
  return `${name || 'audio'}.${format}`
}

function mimeTypeForAudioFormat(format: AudioFormat): string {
  return format === 'wav' ? 'audio/wav' : 'audio/mpeg'
}

function mediaProcessingError(message: string, code: string): Error & {
  taskError: { category: 'system'; message: string; retriable: false; code: string }
} {
  const error = new Error(message) as Error & {
    taskError: { category: 'system'; message: string; retriable: false; code: string }
  }
  error.taskError = { category: 'system', message, retriable: false, code }
  return error
}

function isTaskErrorCarrier(value: unknown): value is { taskError: unknown } {
  return typeof value === 'object' && value !== null && 'taskError' in value
}
