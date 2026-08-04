import { describe, expect, it } from 'vitest'
import { signJwt, verifyJwt } from '../src'

const SECRET = 'test-secret'

describe('jwt HS256', () => {
  it('round-trips a token it signed', () => {
    const token = signJwt({ secret: SECRET, userId: 'user-1', sessionId: 'sess-1', ttlSeconds: 60, nowMs: 1_000_000 })
    const payload = verifyJwt(token, { secret: SECRET, nowMs: 1_000_000 })
    expect(payload).toEqual({
      sub: 'user-1',
      sid: 'sess-1',
      iat: 1000,
      exp: 1060,
      ver: 1,
    })
  })

  it('rejects a token verified with the wrong secret', () => {
    const token = signJwt({ secret: SECRET, userId: 'u', sessionId: 's', ttlSeconds: 60 })
    expect(verifyJwt(token, { secret: 'other-secret' })).toBeUndefined()
  })

  it('rejects a tampered payload', () => {
    const token = signJwt({ secret: SECRET, userId: 'u', sessionId: 's', ttlSeconds: 60 })
    const [header, payload, signature] = token.split('.') as [string, string, string]
    const tampered = `${header}.${payload}.${signature.slice(0, -2)}xx`
    expect(verifyJwt(tampered, { secret: SECRET })).toBeUndefined()
  })

  it('rejects an expired token', () => {
    const issuedAt = 1_000_000
    const token = signJwt({ secret: SECRET, userId: 'u', sessionId: 's', ttlSeconds: 60, nowMs: issuedAt })
    // 120 秒后——已超过 60 秒有效期
    expect(verifyJwt(token, { secret: SECRET, nowMs: issuedAt + 120_000 })).toBeUndefined()
  })

  it('rejects a malformed token', () => {
    expect(verifyJwt('not.a.jwt', { secret: SECRET })).toBeUndefined()
    expect(verifyJwt('onlytwo', { secret: SECRET })).toBeUndefined()
  })

  it('supports key version for rotation', () => {
    const tokenV1 = signJwt({ secret: SECRET, userId: 'u', sessionId: 's', ttlSeconds: 60, keyVersion: 1 })
    const tokenV2 = signJwt({ secret: SECRET, userId: 'u', sessionId: 's', ttlSeconds: 60, keyVersion: 2 })

    // 不检查版本时两个 token 都能通过验证
    expect(verifyJwt(tokenV1, { secret: SECRET })).toMatchObject({ sub: 'u', ver: 1 })
    expect(verifyJwt(tokenV2, { secret: SECRET })).toMatchObject({ sub: 'u', ver: 2 })

    // 版本检查会拒绝版本不匹配的 token
    expect(verifyJwt(tokenV1, { secret: SECRET, expectedKeyVersion: 2 })).toBeUndefined()
    expect(verifyJwt(tokenV2, { secret: SECRET, expectedKeyVersion: 1 })).toBeUndefined()

    // 版本检查接受版本匹配的 token
    expect(verifyJwt(tokenV1, { secret: SECRET, expectedKeyVersion: 1 })).toMatchObject({ sub: 'u', ver: 1 })
    expect(verifyJwt(tokenV2, { secret: SECRET, expectedKeyVersion: 2 })).toMatchObject({ sub: 'u', ver: 2 })
  })
})
