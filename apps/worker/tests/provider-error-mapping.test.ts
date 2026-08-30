import { describe, expect, it } from 'vitest'
import {
  classifyThrownProviderError,
  isProviderErrorInfo,
  providerErrorToTaskError,
} from '../src/provider-error-mapping'

describe('provider error boundary', () => {
  it('accepts only complete, correctly typed provider error info', () => {
    expect(isProviderErrorInfo({
      category: 'rate_limit',
      retriable: true,
      code: 'Throttling',
      message: 'slow down',
      details: { requestId: 'req-1' },
    })).toBe(true)
    expect(isProviderErrorInfo({
      category: 'auth',
      retriable: 'false',
      message: 401,
    })).toBe(false)
    expect(isProviderErrorInfo({
      category: 'invented',
      retriable: false,
      message: 'nope',
    })).toBe(false)
  })

  it('does not trust malformed .info and falls back to HTTP classification', () => {
    expect(classifyThrownProviderError({
      status: 503,
      info: { category: 'auth', retriable: 'false', message: 503 },
    })).toEqual({
      category: 'provider',
      retriable: true,
      message: 'Provider HTTP 503',
    })
  })

  it('delegates opaque errors to the selected provider classifier', () => {
    expect(classifyThrownProviderError(new Error('opaque provider failure'), () => ({
      category: 'rate_limit',
      retriable: true,
      code: 'THROTTLED',
      message: 'retry later',
    }))).toEqual({
      category: 'rate_limit',
      retriable: true,
      code: 'THROTTLED',
      message: 'retry later',
    })
  })

  it('preserves provider diagnostics when converting to a task error', () => {
    expect(providerErrorToTaskError({
      code: 'Throttling',
      message: 'slow down',
      retryable: true,
      category: 'rate_limit',
      details: { requestId: 'req-1' },
    })).toEqual({
      code: 'Throttling',
      message: 'slow down',
      retriable: true,
      category: 'rate_limit',
      details: { requestId: 'req-1' },
    })
  })
})
