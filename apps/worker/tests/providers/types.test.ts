import { describe, expect, it } from 'vitest'
import { providerError } from '../../src/providers/types'

describe('providerError', () => {
  it('builds a ProviderError from code/message/category/retryable', () => {
    const error = providerError('PROVIDER_TIMEOUT', 'request timed out', 'provider', true)
    expect(error).toEqual({
      code: 'PROVIDER_TIMEOUT',
      message: 'request timed out',
      retryable: true,
      category: 'provider',
    })
  })

  it('includes details only when provided', () => {
    expect(providerError('ERR', 'm', 'provider', false, { requestId: 'req_1' })).toEqual({
      code: 'ERR',
      message: 'm',
      retryable: false,
      category: 'provider',
      details: { requestId: 'req_1' },
    })

    // 不传 details 参数 → 完全不含 `details` 键。
    expect('details' in providerError('ERR', 'm', 'provider', false)).toBe(false)
  })
})
