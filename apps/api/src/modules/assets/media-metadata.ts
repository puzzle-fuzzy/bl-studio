import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { spawnProcess } from '@bailian-studio/shared'

export interface ProbeMediaDurationOptions {
  ffprobePath?: string
  runProbe?: (ffprobePath: string, inputPath: string) => Promise<string>
}

/** 读取音频/视频文件时长，不信任浏览器上报的元数据。 */
export async function probeMediaDuration(
  file: File,
  options: ProbeMediaDurationOptions = {},
): Promise<number> {
  const workDir = join(tmpdir(), `bailian-studio-probe-${crypto.randomUUID()}`)
  const inputPath = join(workDir, 'source.bin')
  await mkdir(workDir, { recursive: true })

  try {
    // P1-16：流式写临时文件，避免 ffprobe 前整块载入进程内存。
    await pipeline(Readable.fromWeb(file.stream() as unknown as NodeReadableStream), createWriteStream(inputPath))
    const output = await (options.runProbe ?? runFfprobe)(
      options.ffprobePath ?? 'ffprobe',
      inputPath,
    )
    return parseMediaDuration(output)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export function parseMediaDuration(output: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new Error('无法读取媒体时长：ffprobe 返回了无效结果')
  }

  const record = asRecord(parsed)
  const formatDuration = readDuration(asRecord(record?.['format'])?.['duration'])
  const streamDurations = Array.isArray(record?.['streams'])
    ? record['streams']
      .map(stream => asRecord(stream))
      .filter((stream): stream is Record<string, unknown> => stream !== undefined)
      .filter(stream => stream['codec_type'] === 'audio' || stream['codec_type'] === 'video')
      .map(stream => readDuration(stream['duration']))
      .filter((duration): duration is number => duration !== undefined)
    : []
  const duration = Math.max(formatDuration ?? 0, ...streamDurations)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('无法读取媒体时长：媒体没有有效的音频或视频时长')
  }
  return duration
}

async function runFfprobe(ffprobePath: string, inputPath: string): Promise<string> {
  try {
    const process = spawnProcess([
      ffprobePath,
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,duration',
      '-of', 'json',
      inputPath,
    ], { stdout: 'pipe', stderr: 'pipe' })
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])
    if (exitCode !== 0) {
      throw new Error(`ffprobe 读取媒体失败（exit code ${exitCode}）：${stderr.trim() || '无错误详情'}`)
    }
    return stdout
  } catch (error) {
    throw new Error(
      `无法读取媒体时长，请确认已安装 ffprobe 并配置 FFPROBE_PATH：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readDuration(value: unknown): number | undefined {
  const duration = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(duration) && duration > 0 ? duration : undefined
}
