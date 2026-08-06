import { describe, expect, it } from 'vitest'
import { MemoryRateLimiter, clientIdentity, rateLimitRule, readApiRateLimitConfig } from '../src/lib/rate-limit'

describe('API rate limiting', () => {
  it('does not trust forwarded client headers unless proxy trust is explicit', () => {
    const request = new Request('http://localhost/api/generations', {
      headers: { 'x-forwarded-for': '203.0.113.4', 'x-real-ip': '198.51.100.7' },
    })

    expect(clientIdentity(request)).toBe('local-client')
    expect(clientIdentity(request, true)).toBe('203.0.113.4')
  })

  it('allows up to the configured count and reports retry time afterwards', () => {
    const limiter = new MemoryRateLimiter()
    expect(limiter.consume('client:write', 2, 60_000, 1_000).allowed).toBe(true)
    expect(limiter.consume('client:write', 2, 60_000, 1_001).allowed).toBe(true)
    const rejected = limiter.consume('client:write', 2, 60_000, 1_002)

    expect(rejected.allowed).toBe(false)
    expect(rejected.retryAfterSeconds).toBe(60)
    expect(limiter.consume('client:write', 2, 60_000, 61_000).allowed).toBe(true)
  })

  it('assigns stricter buckets to auth, generation and upload writes', () => {
    const config = readApiRateLimitConfig({
      API_RATE_LIMIT_AUTH_PER_MINUTE: '3',
      API_RATE_LIMIT_GENERATIONS_PER_MINUTE: '4',
      API_RATE_LIMIT_UPLOADS_PER_MINUTE: '5',
    })

    expect(rateLimitRule(new Request('http://localhost/api/auth/login', { method: 'POST' }), config)).toEqual({ bucket: 'auth', limit: 3 })
    expect(rateLimitRule(new Request('http://localhost/api/auth/verify-email', { method: 'POST' }), config)).toEqual({ bucket: 'auth', limit: 3 })
    expect(rateLimitRule(new Request('http://localhost/api/auth/forgot-password', { method: 'POST' }), config)).toEqual({ bucket: 'auth', limit: 3 })
    expect(rateLimitRule(new Request('http://localhost/api/auth/logout-all', { method: 'POST' }), config)).toEqual({ bucket: 'auth', limit: 3 })
    expect(rateLimitRule(new Request('http://localhost/api/generations', { method: 'POST' }), config)).toEqual({ bucket: 'generation', limit: 4 })
    expect(rateLimitRule(new Request('http://localhost/api/assets/upload', { method: 'POST' }), config)).toEqual({ bucket: 'upload', limit: 5 })
    expect(rateLimitRule(new Request('http://localhost/api/generations', { method: 'GET' }), config)).toBeUndefined()
  })

  it('exempts community write endpoints from rate limiting (gallery / prompt-library / feedback)', () => {
    const config = readApiRateLimitConfig({ API_RATE_LIMIT_AUTH_PER_MINUTE: '3' })

    // 社区写端点豁免（有意偏离标准实践，见 rate-limit.ts 注释）。
    expect(rateLimitRule(new Request('http://localhost/api/gallery/generations/id/like', { method: 'POST' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/gallery/generations/id/like', { method: 'DELETE' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/gallery/generations/id/favorite', { method: 'POST' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/gallery/generations/id/visibility', { method: 'PATCH' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/prompt-library', { method: 'POST' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/prompt-library/item-id', { method: 'DELETE' }), config)).toBeUndefined()
    expect(rateLimitRule(new Request('http://localhost/api/feedback', { method: 'POST' }), config)).toBeUndefined()

    // 非社区端点仍受限。
    expect(rateLimitRule(new Request('http://localhost/api/auth/login', { method: 'POST' }), config)).toEqual({ bucket: 'auth', limit: 3 })
    expect(rateLimitRule(new Request('http://localhost/api/generations', { method: 'POST' }), config)).toBeDefined()
    // admin 治理不受豁免（仍走通用 write 桶）。
    expect(rateLimitRule(new Request('http://localhost/api/admin/gallery/generations/id/hide', { method: 'POST' }), config)).toEqual({ bucket: 'write', limit: config.requestsPerMinute })
  })
})
