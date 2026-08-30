import { pathToFileURL } from 'node:url'

type JsonRecord = Record<string, unknown>

export interface CanvasObservabilityBaseline {
  schemaVersion: 1
  windowHours: number
  collectedAt: string
  hasCanvasData: boolean
  execution: {
    total: number
    outcomeCounts: Record<string, number>
    failureRate: number | null
    cancelledRate: number | null
  }
  nodes: {
    failed: number
    generationQueued: number
    cacheHits: number
    cacheMisses: number
    cacheHitRate: number | null
    errorCodes: Array<{ code: string; count: number }>
  }
  durationMs: {
    count: number
    p50: number | null
    p95: number | null
    p99: number | null
    max: number | null
  }
}

interface BaselineOptions {
  windowHours: number
  collectedAt?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function parseLogLine(value: unknown): JsonRecord | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function collectLogLines(input: unknown): JsonRecord[] {
  if (!isRecord(input)) return []
  const data = input.data
  if (!isRecord(data) || !Array.isArray(data.result)) return []

  const lines: JsonRecord[] = []
  for (const stream of data.result) {
    if (!isRecord(stream) || !Array.isArray(stream.values)) continue
    for (const value of stream.values) {
      if (!Array.isArray(value) || value.length < 2) continue
      const parsed = parseLogLine(value[1])
      if (parsed !== undefined) lines.push(parsed)
    }
  }
  return lines
}

function percentile(sortedValues: readonly number[], fraction: number): number | null {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * fraction) - 1))
  return sortedValues[index] ?? null
}

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

export function summarizeCanvasObservability(input: unknown, options: BaselineOptions): CanvasObservabilityBaseline {
  const lines = collectLogLines(input)
  const outcomeCounts: Record<string, number> = {}
  const durations: number[] = []
  const errorCodes: Record<string, number> = {}
  let failedNodes = 0
  let generationQueued = 0
  let cacheHits = 0
  let cacheMisses = 0

  for (const line of lines) {
    const message = readString(line, 'msg')
    if (message === 'task.duration' && readString(line, 'taskType') === 'canvas.execute') {
      incrementCounter(outcomeCounts, readString(line, 'outcome') ?? 'unknown')
      const durationMs = readNumber(line, 'durationMs')
      if (durationMs !== undefined && durationMs >= 0) durations.push(durationMs)
      continue
    }
    if (message === 'canvas.node_failed') {
      failedNodes += 1
      incrementCounter(errorCodes, readString(line, 'errorCode') ?? 'UNKNOWN')
      continue
    }
    if (message === 'canvas.node_generation_queued') {
      generationQueued += 1
      const cacheHit = readBoolean(line, 'cacheHit')
      if (cacheHit === true) cacheHits += 1
      if (cacheHit === false) cacheMisses += 1
    }
  }

  const sortedDurations = [...durations].sort((left, right) => left - right)
  const total = Object.values(outcomeCounts).reduce((sum, count) => sum + count, 0)
  const cacheSamples = cacheHits + cacheMisses
  const errorCodeList = Object.entries(errorCodes)
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))

  return {
    schemaVersion: 1,
    windowHours: options.windowHours,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
    hasCanvasData: total > 0 || failedNodes > 0 || generationQueued > 0,
    execution: {
      total,
      outcomeCounts,
      failureRate: total === 0 ? null : (outcomeCounts.failed ?? 0) / total,
      cancelledRate: total === 0 ? null : (outcomeCounts.cancelled ?? 0) / total,
    },
    nodes: {
      failed: failedNodes,
      generationQueued,
      cacheHits,
      cacheMisses,
      cacheHitRate: cacheSamples === 0 ? null : cacheHits / cacheSamples,
      errorCodes: errorCodeList,
    },
    durationMs: {
      count: sortedDurations.length,
      p50: percentile(sortedDurations, 0.5),
      p95: percentile(sortedDurations, 0.95),
      p99: percentile(sortedDurations, 0.99),
      max: sortedDurations.at(-1) ?? null,
    },
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
  }
  return chunks.join('')
}

function readWindowHours(): number {
  const hoursIndex = process.argv.indexOf('--hours')
  const raw = hoursIndex >= 0 ? process.argv[hoursIndex + 1] : undefined
  if (raw === undefined || !/^\d+$/.test(raw)) throw new Error('用法：observability-baseline.ts --hours <正整数>')
  const hours = Number(raw)
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168) {
    throw new Error('观测窗口必须是 1 到 168 小时之间的整数')
  }
  return hours
}

async function main(): Promise<void> {
  try {
    const windowHours = readWindowHours()
    const raw = await readStdin()
    const payload: unknown = JSON.parse(raw)
    const report = summarizeCanvasObservability(payload, { windowHours })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (!report.hasCanvasData) {
      process.stderr.write('观测基线已采集，但窗口内没有 Canvas 事件；暂不配置告警阈值。\n')
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main()
}
