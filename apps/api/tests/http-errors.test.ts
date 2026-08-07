import { describe, expect, it } from 'vitest'
import { AuthError } from '@bailian-studio/auth'
import { CreditLedgerError } from '@bailian-studio/credit-ledger'
import { GenerationRepositoryError } from '@bailian-studio/generation-repository'
import { ValidationError } from '@bailian-studio/shared'
import { z } from 'zod'
import { errorResponseBody, httpStatusForError } from '../src/lib/http-errors'

describe('httpStatusForError', () => {
  it('maps repository error codes to their HTTP status', () => {
    expect(httpStatusForError(new GenerationRepositoryError('MODEL_NOT_FOUND', 'm'))).toBe(404)
    expect(httpStatusForError(new GenerationRepositoryError('GENERATION_NOT_FOUND', 'm'))).toBe(404)
    expect(httpStatusForError(new GenerationRepositoryError('INVALID_GENERATION_PARAMS', 'm'))).toBe(400)
    expect(httpStatusForError(new GenerationRepositoryError('INVALID_CURSOR', 'm'))).toBe(400)
    expect(httpStatusForError(new GenerationRepositoryError('IDEMPOTENCY_CONFLICT', 'm'))).toBe(409)
    expect(httpStatusForError(new GenerationRepositoryError('DATABASE_ERROR', 'm'))).toBe(500)
  })

  it('maps auth error codes to their HTTP status', () => {
    expect(httpStatusForError(new AuthError('AUTH_INVALID_CREDENTIALS', 'm'))).toBe(401)
    expect(httpStatusForError(new AuthError('AUTH_UNAUTHORIZED', 'm'))).toBe(401)
    expect(httpStatusForError(new AuthError('AUTH_EMAIL_TAKEN', 'm'))).toBe(409)
    expect(httpStatusForError(new AuthError('AUTH_EMAIL_UNVERIFIED', 'm'))).toBe(403)
    expect(httpStatusForError(new AuthError('AUTH_TOKEN_INVALID', 'm'))).toBe(400)
    expect(httpStatusForError(new AuthError('AUTH_TOKEN_EXPIRED', 'm'))).toBe(410)
    expect(httpStatusForError(new AuthError('AUTH_TOKEN_CONSUMED', 'm'))).toBe(409)
    expect(httpStatusForError(new AuthError('AUTH_PASSWORD_UNCHANGED', 'm'))).toBe(409)
    expect(httpStatusForError(new AuthError('AUTH_EMAIL_RATE_LIMITED', 'm'))).toBe(429)
    expect(httpStatusForError(new AuthError('EMAIL_DELIVERY_FAILED', 'm'))).toBe(503)
    expect(httpStatusForError(new AuthError('AUTH_FORBIDDEN', 'm'))).toBe(403)
  })

  it('maps credit ledger errors to explicit billing statuses', () => {
    expect(httpStatusForError(new CreditLedgerError('POINTS_GRANT_INVALID', 'm'))).toBe(400)
    expect(httpStatusForError(new CreditLedgerError('POINTS_INSUFFICIENT', 'm'))).toBe(402)
    expect(httpStatusForError(new CreditLedgerError('POINTS_IDEMPOTENCY_CONFLICT', 'm'))).toBe(409)
  })

  it('maps a ZodError to 400 (manual zod parses in routes)', () => {
    const parsed = z.object({ code: z.string().length(6) }).safeParse({ code: 'x' })
    if (parsed.success) throw new Error('expected a parse failure')
    expect(httpStatusForError(parsed.error)).toBe(400)
  })

  it('maps ValidationError to 400 and unknown errors to 500', () => {
    expect(httpStatusForError(new ValidationError('bad'))).toBe(400)
    expect(httpStatusForError(new Error('boom'))).toBe(500)
    expect(httpStatusForError('not even an error')).toBe(500)
  })
})

describe('errorResponseBody', () => {
  it('mirrors code/message for repository and auth errors', () => {
    expect(errorResponseBody(new GenerationRepositoryError('TASK_NOT_FOUND', 'no task'))).toEqual({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'no task' },
    })
    expect(errorResponseBody(new AuthError('AUTH_UNAUTHORIZED', 'nope'))).toEqual({
      success: false,
      error: { code: 'AUTH_UNAUTHORIZED', message: 'nope' },
    })
    expect(errorResponseBody(new AuthError(
      'AUTH_EMAIL_RATE_LIMITED',
      'wait',
      { retryAt: '2026-07-25T00:01:00.000Z' },
    ))).toEqual({
      success: false,
      error: {
        code: 'AUTH_EMAIL_RATE_LIMITED',
        message: 'wait',
        details: { retryAt: '2026-07-25T00:01:00.000Z' },
      },
    })
    expect(errorResponseBody(new CreditLedgerError('POINTS_INSUFFICIENT', 'not enough', { requiredCents: 20 }))).toEqual({
      success: false,
      error: { code: 'POINTS_INSUFFICIENT', message: 'not enough', details: { requiredCents: 20 } },
    })
  })

  it('preserves structured repository validation details', () => {
    const details = {
      issues: [{
        code: 'UNKNOWN_PARAMETER',
        path: 'legacy_option',
        message: 'Unknown parameter: legacy_option',
        messages: {
          'zh-CN': '未知参数：legacy_option',
          'en-US': 'Unknown parameter: legacy_option',
        },
        expected: {
          'zh-CN': '支持的参数：prompt, size',
          'en-US': 'Supported parameters: prompt, size',
        },
      }],
    }

    expect(errorResponseBody(new GenerationRepositoryError(
      'INVALID_GENERATION_PARAMS',
      'Invalid generation parameters',
      details,
    ))).toEqual({
      success: false,
      error: {
        code: 'INVALID_GENERATION_PARAMS',
        message: 'Invalid generation parameters',
        details,
      },
    })
  })

  it('prefixes the ValidationError message with its field when present', () => {
    expect(errorResponseBody(new ValidationError('required', 'prompt'))).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'prompt: required' },
    })
    expect(errorResponseBody(new ValidationError('bad'))).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'bad' },
    })
  })

  it('turns a ZodError into a VALIDATION_ERROR body with a path-prefixed message', () => {
    const parsed = z.object({ code: z.string().length(6) }).safeParse({ code: 'too-short' })
    if (parsed.success) throw new Error('expected a parse failure')
    const body = errorResponseBody(parsed.error)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toMatch(/^code:/)
  })

  it('wraps unknown errors as stable INTERNAL_ERROR without leaking message/cause (R2-P0-03)', () => {
    // 未分类错误的 message/cause 原文只进服务端日志，绝不回传客户端。
    expect(errorResponseBody(new Error('boom'))).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })

    const withCause = new Error('outer', { cause: new Error('root cause') })
    expect(errorResponseBody(withCause)).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })

    // 非 Error 值回退到通用消息。
    expect(errorResponseBody('something odd')).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
  })

  it('adds a request traceId without changing the nested error contract', () => {
    expect(errorResponseBody(new AuthError('AUTH_UNAUTHORIZED', 'nope'), 'request-42')).toEqual({
      success: false,
      error: { code: 'AUTH_UNAUTHORIZED', message: 'nope' },
      traceId: 'request-42',
    })
  })
})
