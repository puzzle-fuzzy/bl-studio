import { describe, expect, it } from 'vitest'
import { clearIdempotencyKey, idempotencyKeyFor, payloadFingerprint, stableStringify } from './idempotency'

describe('idempotency', () => {
  it('produces stable fingerprints regardless of key order', () => {
    const a = stableStringify({ b: 1, a: 2, c: [1, 2] })
    const b = stableStringify({ c: [1, 2], a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('reuses the same key for identical payloads', () => {
    const payload = { modelId: 'm1', params: { prompt: 'hi' }, assetRefs: {} }
    expect(idempotencyKeyFor(payload)).toBe(idempotencyKeyFor(payload))
  })

  it('produces different keys for different payloads', () => {
    const first = idempotencyKeyFor({ modelId: 'm1', params: { prompt: 'a' }, assetRefs: {} })
    const second = idempotencyKeyFor({ modelId: 'm1', params: { prompt: 'b' }, assetRefs: {} })
    expect(first).not.toBe(second)
  })

  it('clears the cached key after successful submit', () => {
    const payload = { modelId: 'm1', params: { prompt: 'x' }, assetRefs: {} }
    const first = idempotencyKeyFor(payload)
    clearIdempotencyKey(payload)
    expect(idempotencyKeyFor(payload)).not.toBe(first)
  })

  it('fingerprints ignore undefined values', () => {
    expect(payloadFingerprint({ modelId: 'm', params: { a: undefined, b: 1 }, assetRefs: {} })).toBe(
      payloadFingerprint({ modelId: 'm', params: { b: 1 }, assetRefs: {} }),
    )
  })
})
