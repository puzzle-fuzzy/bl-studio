import { isReadyPayload } from '../deploy/rehearsal-smoke'

const requestTimeoutMs = 5_000

export interface DevSmokeOptions {
  readonly apiOrigin: string
  readonly studioOrigin: string
  readonly writerOrigin: string
  readonly canvasOrigin: string
}

const frontendRoutes = [
  { label: 'Studio', originKey: 'studioOrigin', path: '/login' },
  { label: 'Writer', originKey: 'writerOrigin', path: '/writer/login' },
  { label: 'Canvas', originKey: 'canvasOrigin', path: '/canvas/login' },
] as const

export function parseDevSmokeOptions(env: NodeJS.ProcessEnv = process.env): DevSmokeOptions {
  return {
    apiOrigin: env.DEV_API_ORIGIN?.trim() || 'http://127.0.0.1:5003',
    studioOrigin: env.DEV_STUDIO_ORIGIN?.trim() || 'http://127.0.0.1:5002',
    writerOrigin: env.DEV_WRITER_ORIGIN?.trim() || 'http://127.0.0.1:5006',
    canvasOrigin: env.DEV_CANVAS_ORIGIN?.trim() || 'http://127.0.0.1:5007',
  }
}

export async function runDevSmoke(
  options: DevSmokeOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await expectReady(`${options.apiOrigin}/api/health/live`, fetchImpl, 'API live')
  await expectReady(`${options.apiOrigin}/api/health/ready`, fetchImpl, 'API ready')

  for (const route of frontendRoutes) {
    const origin = options[route.originKey]
    const response = await fetchImpl(new URL(route.path, origin), {
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) throw new Error(`${route.label} route returned HTTP ${response.status}`)
    const html = await response.text()
    if (!html.toLowerCase().includes('<!doctype html>')) {
      throw new Error(`${route.label} route did not return an HTML app shell`)
    }
    await expectReady(`${origin}/api/health/ready`, fetchImpl, `${route.label} API proxy`)
  }
}

async function expectReady(
  url: string,
  fetchImpl: typeof fetch,
  label: string,
): Promise<void> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(requestTimeoutMs) })
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
  if (url.endsWith('/live')) {
    if (typeof payload !== 'object' || payload === null || (payload as { success?: unknown }).success !== true) {
      throw new Error(`${label} returned an invalid live payload`)
    }
    return
  }
  if (!isReadyPayload(payload)) throw new Error(`${label} did not report database, storage, and worker ready`)
}

async function main(): Promise<void> {
  await runDevSmoke(parseDevSmokeOptions())
  console.log('Dev smoke passed: API live/ready, Studio, Writer, Canvas, and all frontend API proxies are healthy.')
}

if (import.meta.main) await main()
