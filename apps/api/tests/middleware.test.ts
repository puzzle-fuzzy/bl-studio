import { describe, expect, it } from 'vitest'
import { createTestApp } from '../src/test-app'
import { resolveRequestId } from '../src/lib/middleware'

const { app } = createTestApp()

describe('http middleware', () => {
  it('attaches security headers to every response', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live'))

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('allows CORS for an allowed origin', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      headers: { origin: 'http://localhost:5002' },
    }))

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5002')
    // 实际中响应头字段值不区分大小写；@elysia/cors 输出的是 "Origin"。
    expect((response.headers.get('vary') ?? '').toLowerCase()).toContain('origin')
  })

  it('allows the merged frontend development origin by default', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      headers: { origin: 'http://localhost:5002' },
    }))

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5002')
  })

  it('no longer allows the removed Vue development origin by default', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      headers: { origin: 'http://localhost:5004' },
    }))

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not allow CORS for an unknown origin', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      headers: { origin: 'https://evil.example' },
    }))

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('uses injected allowed origins for CSRF instead of reading process.env', async () => {
    const custom = createTestApp({
      allowedOrigins: ['https://create.yxswy.com'],
      requestGuardConfig: {
        maxJsonBodyBytes: 1024,
        maxMultipartBodyBytes: 1024,
        maxOtherBodyBytes: 1024,
        csrfRequireOrigin: true,
      },
    })
    const response = await custom.app.handle(new Request('http://localhost/api/health/live', {
      method: 'POST',
      headers: {
        cookie: 'bailian_studio_session=session-token',
        origin: 'https://create.yxswy.com',
      },
    }))

    expect(response.status).not.toBe(403)
  })

  it('answers CORS preflight with 204', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5002' },
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5002')
  })

  it('echoes an inbound x-request-id when the caller supplies one', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live', {
      headers: { 'x-request-id': 'client-trace-123' },
    }))

    expect(response.headers.get('x-request-id')).toBe('client-trace-123')
  })

  it('does not echo an untrusted or oversized x-request-id', () => {
    const oversized = new Request('http://localhost/api/health/live', {
      headers: { 'x-request-id': 'x'.repeat(129) },
    })
    const invalid = new Request('http://localhost/api/health/live', {
      headers: { 'x-request-id': 'bad value' },
    })

    expect(resolveRequestId(oversized)).toMatch(/^[0-9a-f-]{36}$/)
    expect(resolveRequestId(invalid)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('generates an x-request-id when the caller supplies none', async () => {
    const response = await app.handle(new Request('http://localhost/api/health/live'))

    const requestId = response.headers.get('x-request-id')
    expect(requestId).not.toBeNull()
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('rejects an oversized JSON request before route parsing', async () => {
    const response = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(2 * 1024 * 1024 + 1),
      },
      body: '{}',
    }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('REQUEST_TOO_LARGE')
  })

  it('rejects an oversized chunked JSON request while it is being read', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(2 * 1024 * 1024 + 1)))
        controller.close()
      },
    })
    const response = await app.handle(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('REQUEST_TOO_LARGE')
  })

  it('rejects a cross-origin cookie-authenticated write', async () => {
    const response = await app.handle(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'bailian_studio_session=session-token',
        origin: 'https://evil.example',
      },
    }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('CSRF_ORIGIN_INVALID')
  })
})
