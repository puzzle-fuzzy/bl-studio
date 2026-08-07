import { describe, expect, it } from 'vitest'
import { classifyDashScopeError } from '../src/errors'

describe('classifyDashScopeError', () => {
  it('classifies auth errors as non-retriable', () => {
    expect(classifyDashScopeError({ code: 'InvalidApiKey', message: 'Unauthorized API key' })).toEqual({
      category: 'auth',
      retriable: false,
      code: 'InvalidApiKey',
      message: 'Unauthorized API key',
    })
  })

  it('classifies asynchronous model access denial as non-retriable auth', () => {
    expect(classifyDashScopeError({
      output: { code: 'Model.AccessDenied', message: 'Model access denied.' },
    })).toEqual({
      category: 'auth',
      retriable: false,
      code: 'Model.AccessDenied',
      message: 'Model access denied.',
    })
  })

  it('classifies quota object messages as non-retriable', () => {
    expect(classifyDashScopeError({ message: 'quota exceeded' })).toEqual({
      category: 'quota',
      retriable: false,
      message: 'quota exceeded',
    })
  })

  it('treats HTTP 400 Arrearage as quota instead of validation', () => {
    expect(classifyDashScopeError({ status: 400, code: 'Arrearage', message: 'Access denied' })).toEqual({
      category: 'quota',
      retriable: false,
      code: 'Arrearage',
      message: 'Access denied',
    })
  })

  it('classifies rate-limit errors as retriable', () => {
    expect(classifyDashScopeError(new Error('Request rate limit exceeded'))).toEqual({
      category: 'rate_limit',
      retriable: true,
      message: 'Request rate limit exceeded',
    })
  })

  it('classifies 429 status errors as retriable rate limits', () => {
    expect(classifyDashScopeError({ status: 429, message: 'Too many requests' })).toEqual({
      category: 'rate_limit',
      retriable: true,
      message: 'Too many requests',
    })
  })

  it('classifies 400 statusCode errors as non-retriable validation errors', () => {
    expect(classifyDashScopeError({ statusCode: '400', message: 'Bad request' })).toEqual({
      category: 'validation',
      retriable: false,
      message: 'Bad request',
    })
  })

  it('classifies unrecognized HTTP statuses as non-retriable system errors', () => {
    expect(classifyDashScopeError({ status: 404, message: '' })).toEqual({
      category: 'system',
      retriable: false,
      message: 'DashScope HTTP 404',
    })
  })

  it('classifies code-bug shaped errors (no keyword, no status) as non-retriable system errors', () => {
    expect(classifyDashScopeError(new Error('Cannot read properties of undefined'))).toEqual({
      category: 'system',
      retriable: false,
      message: 'Cannot read properties of undefined',
    })
  })

  it('classifies un-wrapped network errors (fetch failed / TCP codes) as retriable network errors', () => {
    expect(classifyDashScopeError(new Error('fetch failed: ECONNRESET'))).toEqual({
      category: 'network',
      retriable: true,
      message: 'fetch failed: ECONNRESET',
    })
    expect(classifyDashScopeError(new Error('getaddrinfo ENOTFOUND api.dashscope.aliyuncs.com'))).toEqual({
      category: 'network',
      retriable: true,
      message: 'getaddrinfo ENOTFOUND api.dashscope.aliyuncs.com',
    })
  })

  it('treats every 5xx status as a retriable provider failure', () => {
    expect(classifyDashScopeError({ status: 501 })).toEqual({
      category: 'provider',
      retriable: true,
      message: 'DashScope HTTP 501',
    })
    expect(classifyDashScopeError({ status: 599, message: 'Upstream unavailable' })).toEqual({
      category: 'provider',
      retriable: true,
      message: 'Upstream unavailable',
    })
  })
})
