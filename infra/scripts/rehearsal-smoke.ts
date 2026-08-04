import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sleep, spawnProcess } from '@bailian-studio/shared'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const composeFile = resolve(repositoryRoot, 'infra', 'docker', 'docker-compose.rehearsal.yml')
const defaultApiOrigin = 'http://127.0.0.1:5013'
const defaultWebOrigin = 'http://127.0.0.1:5012'
const startupTimeoutMs = 180_000
const requestTimeoutMs = 5_000

export interface RehearsalSmokeOptions {
  readonly build: boolean
  readonly keep: boolean
  readonly apiOrigin: string
  readonly webOrigin: string
}

export interface RehearsalCommandRunner {
  (args: readonly string[]): Promise<void>
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
): Promise<void> {
  let startAttempted = false
  try {
    // Rehearsal data is intentionally disposable. Reset it before every run so
    // stale queue, outbox, artifact, or migration state cannot contaminate the
    // release verdict. `--keep` preserves only the freshly-created environment
    // after this reset so a failed candidate can still be inspected.
    await runCommand(['down', '--volumes', '--remove-orphans'])
    if (options.build) {
      // Build the two image owners first. Migrate, artifact-init, Worker and
      // ops-health are image-only consumers, so letting `up --build` resolve
      // everything concurrently can trigger pointless registry pulls before
      // the shared local runtime image exists.
      await runCommand(['build', 'api', 'web'])
    }
    startAttempted = true
    await runCommand(['up', '-d', '--no-build', '--pull', 'never'])

    await waitForReady(`${options.apiOrigin}/api/health/ready`, fetchImpl)
    await waitForReady(`${options.webOrigin}/api/health/ready`, fetchImpl)
    await waitForHtml(`${options.webOrigin}/`, fetchImpl)
    await verifyWebRelease(`${options.webOrigin}/`, fetchImpl)
    await runCommand(['--profile', 'ops', 'run', '--rm', 'ops-health'])

    // A production-shaped restart must not leave the API reporting a stale or
    // missing worker heartbeat after the worker process returns.
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

async function main(): Promise<void> {
  const options = parseRehearsalArgs(process.argv.slice(2))
  await runRehearsalSmoke(options)
  console.log(`Rehearsal smoke passed (build=${options.build}, keep=${options.keep})`)
}

if (import.meta.main) await main()
