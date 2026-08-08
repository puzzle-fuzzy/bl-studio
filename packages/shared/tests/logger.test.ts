import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLogger,
  redactCredentialSubstrings,
  resolveLogFormat,
  safeJsonStringify,
} from '../src/logger'

const originalInfo = console.info

/** 临时设置环境变量，返回恢复函数；undefined 表示删除该键。 */
function withEnv(env: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('createLogger (console 模式)', () => {
  let restore: () => void

  beforeEach(() => {
    // 测试文件并行执行时，其他文件可能设置 LOG_FORMAT；console 分支必须显式隔离。
    restore = withEnv({ LOG_FORMAT: 'console', NODE_ENV: 'test' })
  })

  afterEach(() => {
    console.info = originalInfo
    restore()
  })

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

  it('keeps a shared non-cyclic object in both fields', () => {
    const shared = { provider: 'dashscope' }
    const output = safeJsonStringify({ first: shared, second: shared })

    expect(output).toBe('{"first":{"provider":"dashscope"},"second":{"provider":"dashscope"}}')
  })
})

describe('createLogger (json 模式)', () => {
  let restore: () => void
  let writeMock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // 显式 json 格式，隔离本机 NODE_ENV 的影响。
    restore = withEnv({ LOG_FORMAT: 'json', NODE_ENV: 'test' })
    writeMock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    writeMock.mockRestore()
    restore()
  })

  it('writes a single JSON line with reserved fields and metadata', () => {
    const logger = createLogger('api')
    logger.info('request.completed', { requestId: 'r1', status: 200, durationMs: 5 })

    expect(writeMock).toHaveBeenCalledTimes(1)
    const line = String(writeMock.mock.calls[0]?.[0])
    const parsed = JSON.parse(line) as Record<string, unknown>

    expect(typeof parsed.ts).toBe('string')
    expect(Number.isNaN(Date.parse(parsed.ts as string))).toBe(false)
    expect(parsed.level).toBe('info')
    expect(parsed.scope).toBe('api')
    expect(parsed.msg).toBe('request.completed')
    expect(parsed.requestId).toBe('r1')
    expect(parsed.status).toBe(200)
    expect(parsed.durationMs).toBe(5)
  })

  it('redacts sensitive keys even in json mode', () => {
    const logger = createLogger('api')
    logger.info('request.completed', {
      requestId: 'r2',
      prompt: 'private prompt',
      raw: { provider: 'private response' },
      signedUrl: 'https://storage.test/private-token',
    })

    const line = String(writeMock.mock.calls[0]?.[0])
    expect(line).not.toContain('private prompt')
    expect(line).not.toContain('private response')
    expect(line).not.toContain('private-token')
    expect(line).toContain('"prompt":"[Redacted]"')
  })

  it('does not throw for bigint and circular metadata and still emits valid JSON', () => {
    const logger = createLogger('auth')
    const circular: Record<string, unknown> = { count: 1n, ts: 'kept' }
    circular.self = circular

    expect(() => logger.error('started', circular)).not.toThrow()
    const line = String(writeMock.mock.calls[0]?.[0])
    const parsed = JSON.parse(line) as Record<string, unknown>
    // 保留字段 ts 覆盖 meta 里的 ts，避免时间戳被业务字段污染。
    expect(typeof parsed.ts).toBe('string')
    expect(parsed.count).toBe('1')
  })

  it('routes warn and error to stdout (single stream), not console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger('worker')
    logger.warn('task.lock_renew_failed', { taskId: 't1' })
    logger.error('task.threw', { taskId: 't1' })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(writeMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(writeMock.mock.calls[1]?.[0]))).toMatchObject({ level: 'error', msg: 'task.threw' })
    errorSpy.mockRestore()
  })
})

describe('值级凭据脱敏（R2-P0-04）', () => {
  it('redacts credential-looking substrings from arbitrary string values', () => {
    expect(safeJsonStringify({
      // 非名单 key（message/error 等）里的错误文本同样会被扫描。
      message: 'provider error: connection refused to postgres://admin:S3cretPass@db.internal:5432',
    })).not.toContain('S3cretPass')
    expect(safeJsonStringify({
      error: 'upload failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    })).not.toContain('eyJhbGci')
    expect(safeJsonStringify({ error: 'invalid key sk-aBcDeFg123456' })).not.toContain('sk-aBcDeFg')
    expect(safeJsonStringify({ error: 'denied AKIAIOSFODNN7EXAMPLE' })).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('keeps non-sensitive values and short constants intact', () => {
    const output = safeJsonStringify({
      status: 'OK',
      code: 'HTTP_200_OK',
      ts: '2026-08-08T01:00:00.000Z',
      msg: 'task completed',
    })
    expect(output).toContain('"status":"OK"')
    expect(output).toContain('"code":"HTTP_200_OK"')
    expect(output).toContain('2026-08-08T01:00:00.000Z')
    expect(output).toContain('task completed')
  })

  it('redacts the message argument before writing in console mode', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createLogger('api')
    logger.info('dashscope rejected Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig123')
    expect(String(info.mock.calls[0]?.[0])).not.toContain('eyJhbGci')
    info.mockRestore()
  })

  it('redacts the message argument in json mode too', () => {
    const writeMock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const restore = withEnv({ LOG_FORMAT: 'json', NODE_ENV: 'test' })
    try {
      const logger = createLogger('worker')
      logger.error('signature LTAI5tJz0SecretKey0123456 expired')
      const line = String(writeMock.mock.calls[0]?.[0])
      expect(line).not.toContain('LTAI5tJz0')
      expect(JSON.parse(line)).toMatchObject({ level: 'error' })
    } finally {
      writeMock.mockRestore()
      restore()
    }
  })
})

describe('redactCredentialSubstrings', () => {
  it('replaces each credential pattern while preserving surrounding context', () => {
    expect(redactCredentialSubstrings('Bearer abc.def.ghi done'))
      .toBe('[Redacted] done')
    expect(redactCredentialSubstrings('key=sk-abc123456 done'))
      .toBe('key=[Redacted] done')
    expect(redactCredentialSubstrings('plain text'))
      .toBe('plain text')
  })
})

describe('resolveLogFormat', () => {
  afterEach(() => {
    console.info = originalInfo
  })

  it('prefers an explicit LOG_FORMAT over NODE_ENV', () => {
    const restore = withEnv({ LOG_FORMAT: 'console', NODE_ENV: 'production' })
    expect(resolveLogFormat()).toBe('console')
    restore()
  })

  it('defaults to json when NODE_ENV=production and LOG_FORMAT is unset', () => {
    const restore = withEnv({ LOG_FORMAT: undefined, NODE_ENV: 'production' })
    expect(resolveLogFormat()).toBe('json')
    restore()
  })

  it('defaults to console in non-production environments', () => {
    const restore = withEnv({ LOG_FORMAT: undefined, NODE_ENV: 'test' })
    expect(resolveLogFormat()).toBe('console')
    restore()
  })
})
