import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '../src/logger'

describe('createLogger', () => {
  afterEach(() => {
    console.info = originalInfo
  })

  const originalInfo = console.info

  it('writes scoped info messages with metadata', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('auth')

    logger.info('started', { requestId: 'req_123' })

    expect(info).toHaveBeenCalledWith('[auth] started {"requestId":"req_123"}')
  })

  it('does not throw for non-JSON-safe metadata', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const circular: Record<string, unknown> = { count: 1n }
    circular.self = circular
    const logger = createLogger('auth')

    expect(() => logger.info('started', circular)).not.toThrow()
    expect(info).toHaveBeenCalled()
  })

  it('redacts payload-like metadata before writing logs', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('api')

    logger.info('request.completed', {
      requestId: 'req_123',
      prompt: 'private prompt',
      raw: { provider: 'private response' },
      signedUrl: 'https://storage.test/private-token',
      nested: { authorization: 'Bearer private-token' },
    })

    const output = String(info.mock.calls[0]?.[0])
    expect(output).not.toContain('private prompt')
    expect(output).not.toContain('private response')
    expect(output).not.toContain('private-token')
    expect(output).toContain('"prompt":"[Redacted]"')
    expect(output).toContain('"authorization":"[Redacted]"')
  })
})
