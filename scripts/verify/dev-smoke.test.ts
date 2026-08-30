import { describe, expect, it } from 'vitest'
import { parseDevSmokeOptions, runDevSmoke } from './dev-smoke'

const readyPayload = JSON.stringify({
  success: true,
  data: { status: 'ok', checks: { database: 'ok', storage: 'ok', worker: 'ok' } },
})

describe('dev smoke command', () => {
  it('uses isolated loopback defaults and supports origin overrides', () => {
    expect(parseDevSmokeOptions({})).toEqual({
      apiOrigin: 'http://127.0.0.1:5003',
      studioOrigin: 'http://127.0.0.1:5002',
      writerOrigin: 'http://127.0.0.1:5006',
      canvasOrigin: 'http://127.0.0.1:5007',
    })
    expect(parseDevSmokeOptions({ DEV_API_ORIGIN: 'http://api.test:1' }).apiOrigin).toBe('http://api.test:1')
  })

  it('checks API health, all three HTML shells, and each frontend API proxy', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/login')) return new Response('<!doctype html><title>app</title>')
      if (url.endsWith('/api/health/live')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response(readyPayload, { status: 200 })
    }) as typeof fetch

    await expect(runDevSmoke(parseDevSmokeOptions({}), fetchImpl)).resolves.toBeUndefined()
    expect(calls).toHaveLength(8)
    expect(calls).toContain('http://127.0.0.1:5006/writer/login')
    expect(calls).toContain('http://127.0.0.1:5007/api/health/ready')
  })

  it('rejects a degraded worker readiness payload', async () => {
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/api/health/live')) return new Response(JSON.stringify({ success: true }))
      return new Response(JSON.stringify({
        success: true,
        data: { status: 'degraded', checks: { database: 'ok', storage: 'ok', worker: 'failed' } },
      }))
    }) as typeof fetch

    await expect(runDevSmoke(parseDevSmokeOptions({}), fetchImpl)).rejects.toThrow('API ready')
  })
})
