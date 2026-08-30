import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep, spawnProcess } from '@bailian-studio/shared/server'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const composeFile = resolve(repositoryRoot, 'deploy', 'docker', 'compose.rehearsal.yaml')
const defaultApiOrigin = process.env.REHEARSAL_API_ORIGIN?.trim() || 'http://127.0.0.1:5013'
const defaultWebOrigin = process.env.REHEARSAL_WEB_ORIGIN?.trim() || 'http://127.0.0.1:5012'
const startupTimeoutMs = 180_000
const requestTimeoutMs = 5_000
const releaseWebRoutes = [
  { label: 'Studio', path: '/', assetPrefix: '/assets/' },
  { label: 'Writer', path: '/writer/', assetPrefix: '/writer/assets/' },
  { label: 'Canvas', path: '/canvas/', assetPrefix: '/canvas/assets/' },
  { label: 'Admin', path: '/admin/', assetPrefix: '/admin/assets/' },
] as const

export interface RehearsalSmokeOptions {
  readonly build: boolean
  readonly keep: boolean
  readonly apiOrigin: string
  readonly webOrigin: string
}

export type RehearsalCommandRunner = (args: readonly string[]) => Promise<void>

export type RehearsalCommandCapture = (args: readonly string[]) => Promise<string>

/**
 * 断言容器日志中出现 JSON-lines 结构化条目（LOG_FORMAT=json 生效）。
 * 逐行剥离 compose 的 `service | ` 前缀后尝试 JSON 解析；命中含
 * level(info/warn/error) + msg 的记录即通过。用于端到端验证生产日志格式。
 */
export function verifyJsonLogLines(logs: string): void {
  for (const rawLine of logs.split('\n')) {
    const separatorIndex = rawLine.indexOf(' | ')
    const candidate = separatorIndex === -1 ? rawLine : rawLine.slice(separatorIndex + 3)
    const trimmed = candidate.trim()
    if (trimmed.length === 0) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    const record = parsed as { level?: unknown; msg?: unknown }
    if (['info', 'warn', 'error'].includes(String(record.level)) && typeof record.msg === 'string') {
      return
    }
  }
  throw new Error('Rehearsal API logs did not contain JSON-lines entries (LOG_FORMAT=json)')
}

export function parseRehearsalArgs(args: readonly string[]): RehearsalSmokeOptions {
  let build = true
  let keep = false
  for (const arg of args) {
    if (arg === '--no-build') {
      build = false
    } else if (arg === '--keep') {
      keep = true
    } else {
      throw new Error(`Unknown rehearsal smoke option '${arg}'. Expected --no-build or --keep.`)
    }
  }
  return { build, keep, apiOrigin: defaultApiOrigin, webOrigin: defaultWebOrigin }
}

export function isReadyPayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const root = payload as { success?: unknown; data?: unknown }
  if (root.success !== true || typeof root.data !== 'object' || root.data === null) return false
  const data = root.data as { status?: unknown; checks?: unknown }
  if (data.status !== 'ok' || typeof data.checks !== 'object' || data.checks === null) return false
  const checks = data.checks as Record<string, unknown>
  return checks['database'] === 'ok' && checks['storage'] === 'ok' && checks['worker'] === 'ok'
}

export async function runRehearsalSmoke(
  options: RehearsalSmokeOptions,
  runCommand: RehearsalCommandRunner = createDockerCommandRunner(),
  fetchImpl: typeof fetch = fetch,
  captureCommand: RehearsalCommandCapture = createDockerCaptureCommand(),
): Promise<void> {
  let startAttempted = false
  try {
    // Rehearsal 数据刻意设计为可丢弃的。每次运行前重置，避免过期的队列、
    // outbox、artifact 或迁移状态污染发布结论。`--keep` 只保留本次重置后
    // 新建的环境，便于排查失败的候选版本。
    await runCommand(['down', '--volumes', '--remove-orphans'])
    if (options.build) {
      // 先构建两个镜像所有者。Migrate、artifact-init、Worker 和 ops-health
      // 只是镜像消费者，若让 `up --build` 并发解析所有内容，可能在共享
      // 本地运行时镜像就绪前触发无意义的 registry 拉取。
      await runCommand(['build', 'api', 'web'])
    }
    startAttempted = true
    await runCommand(['up', '-d', '--no-build', '--pull', 'never'])

    await waitForReady(`${options.apiOrigin}/api/health/ready`, fetchImpl)
    await waitForReady(`${options.webOrigin}/api/health/ready`, fetchImpl)
    await waitForHtml(`${options.webOrigin}/`, fetchImpl)
    await verifyWebRelease(`${options.webOrigin}/`, fetchImpl)
    await verifyWebRoutes(options.webOrigin, fetchImpl)

    // 端到端验证 LOG_FORMAT=json：api 容器日志必须包含结构化 JSON-lines 条目。
    verifyJsonLogLines(await captureCommand(['logs', 'api']))

    await runCommand(['--profile', 'ops', 'run', '--rm', 'ops-health'])

    // 生产形态的 restart 不应让 API 在 worker 进程重启后仍报告过期或
    // 缺失的 worker heartbeat。
    await runCommand(['restart', 'api', 'worker'])
    await waitForReady(`${options.apiOrigin}/api/health/ready`, fetchImpl)
    await waitForReady(`${options.webOrigin}/api/health/ready`, fetchImpl)
  } finally {
    if (startAttempted && !options.keep) {
      await runCommand(['down', '--volumes', '--remove-orphans'])
    }
  }
}

async function waitForReady(url: string, fetchImpl: typeof fetch): Promise<void> {
  await waitForHttp(url, fetchImpl, async response => {
    if (!response.ok) return false
    try {
      return isReadyPayload(await response.json())
    } catch {
      return false
    }
  })
}

async function waitForHtml(url: string, fetchImpl: typeof fetch): Promise<void> {
  await waitForHttp(url, fetchImpl, async response => response.ok && (await response.text()).includes('<!doctype html>'))
}

export async function verifyWebRelease(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const rootResponse = await fetchImpl(url, {
    headers: { 'accept-encoding': 'gzip' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  if (!rootResponse.ok) throw new Error(`Release Web root returned HTTP ${rootResponse.status}`)
  assertSecurityHeaders(rootResponse.headers, 'Release Web root')
  const rootCacheControl = rootResponse.headers.get('cache-control') ?? ''
  if (!rootCacheControl.toLowerCase().includes('no-cache')) {
    throw new Error('Release Web root must be revalidated with Cache-Control: no-cache')
  }

  const html = await rootResponse.text()
  const assetPath = html.match(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/)?.[1]
  if (assetPath === undefined) throw new Error('Release Web root did not reference a fingerprinted JS/CSS asset')

  const assetResponse = await fetchImpl(new URL(assetPath, url), {
    headers: { 'accept-encoding': 'gzip' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  if (!assetResponse.ok) throw new Error(`Release Web asset returned HTTP ${assetResponse.status}`)
  assertSecurityHeaders(assetResponse.headers, 'Release Web asset')
  const assetCacheControl = assetResponse.headers.get('cache-control') ?? ''
  if (!assetCacheControl.includes('max-age=31536000')) {
    throw new Error('Release Web assets must be cached for one year')
  }
  if (assetResponse.headers.get('content-encoding') !== 'gzip') {
    throw new Error('Release Web assets must support gzip transfer encoding')
  }
}

export async function verifyWebRoutes(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const route of releaseWebRoutes) {
    const response = await fetchImpl(new URL(route.path, origin), {
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) throw new Error(`Release ${route.label} route returned HTTP ${response.status}`)
    assertSecurityHeaders(response.headers, `Release ${route.label} route`)

    const html = await response.text()
    if (!html.toLowerCase().includes('<!doctype html>')) {
      throw new Error(`Release ${route.label} route did not return an HTML app shell`)
    }
    const assetPattern = new RegExp(
      `(?:src|href)=["'](${escapeRegExp(route.assetPrefix)}[^"']+\\.(?:js|css))["']`,
    )
    if (!assetPattern.test(html)) {
      throw new Error(`Release ${route.label} route did not reference its fingerprinted asset prefix`)
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assertSecurityHeaders(headers: Headers, label: string): void {
  const expectedHeaders = {
    'content-security-policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
  } as const
  for (const [name, expected] of Object.entries(expectedHeaders)) {
    if (headers.get(name) !== expected) {
      throw new Error(`${label} is missing required ${name} response header`)
    }
  }
}

async function waitForHttp(
  url: string,
  fetchImpl: typeof fetch,
  predicate: (response: Response) => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + startupTimeoutMs
  let lastError = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(requestTimeoutMs) })
      if (await predicate(response)) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(1_000)
  }
  throw new Error(`Timed out waiting for rehearsal endpoint ${url}: ${lastError}`)
}

function createDockerCommandRunner(): RehearsalCommandRunner {
  return async args => {
    const process = spawnProcess(['docker', 'compose', '-f', composeFile, ...args], {
      cwd: repositoryRoot,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await process.exited
    if (exitCode !== 0) throw new Error(`docker compose ${args.join(' ')} exited with code ${exitCode}`)
  }
}

function createDockerCaptureCommand(): RehearsalCommandCapture {
  return async args => {
    const process = spawnProcess(['docker', 'compose', '-f', composeFile, ...args], {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const exitCode = await process.exited
    if (exitCode !== 0) throw new Error(`docker compose ${args.join(' ')} exited with code ${exitCode}`)
    return readWebStream(process.stdout)
  }
}

async function readWebStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const options = parseRehearsalArgs(process.argv.slice(2))
  await runRehearsalSmoke(options)
  console.log(`Rehearsal smoke passed (build=${options.build}, keep=${options.keep})`)
}

if (import.meta.main) await main()
