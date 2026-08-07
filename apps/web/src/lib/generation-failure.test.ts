import { describe, expect, it } from 'vitest'
import type { GenerationRecord } from '@bailian-studio/api-client'
import { describeGenerationFailure } from './generation-failure'

function makeRecord(overrides: Partial<GenerationRecord>): GenerationRecord {
  return {
    id: 'g-1',
    userId: 'u-1',
    modelId: 'vidu-reference-video',
    provider: 'dashscope',
    providerModel: 'vidu/viduq3-mix_reference2video',
    category: 'video',
    inputParams: {},
    status: 'failed',
    visibility: 'private',
    costEstimate: 0,
    currency: 'CNY',
    pricingVersion: 'test',
    modelManifestHash: 'test',
    providerCancelStatus: 'not_requested',
    createdAt: '2026-08-07T12:32:32.460Z',
    updatedAt: '2026-08-07T12:32:40.000Z',
    ...overrides,
  }
}

describe('generation-failure', () => {
  it('surfaces the provider message from errorJson', () => {
    const record = makeRecord({
      errorJson: {
        code: 'InvalidParameter',
        message: 'The product is not activated.',
        category: 'validation',
        retriable: false,
      },
    })
    expect(describeGenerationFailure(record)).toEqual({
      message: 'The product is not activated.',
      statusReason: undefined,
      code: 'InvalidParameter',
      category: 'validation',
      retriable: false,
      details: undefined,
    })
  })

  it('deduplicates statusReason identical to the message', () => {
    const record = makeRecord({
      statusReason: 'The product is not activated.',
      errorJson: { message: 'The product is not activated.' },
    })
    const view = describeGenerationFailure(record)
    expect(view.message).toBe('The product is not activated.')
    expect(view.statusReason).toBeUndefined()
  })

  it('keeps statusReason when it differs from the message', () => {
    const record = makeRecord({
      statusReason: '生成失败',
      errorJson: { message: 'provider raw message', details: { output: { code: 'E1' } } },
    })
    const view = describeGenerationFailure(record)
    expect(view.message).toBe('provider raw message')
    expect(view.statusReason).toBe('生成失败')
    expect(view.details).toEqual({ output: { code: 'E1' } })
  })

  it('handles a record with only statusReason', () => {
    const record = makeRecord({ statusReason: '已取消' })
    const view = describeGenerationFailure(record)
    expect(view.message).toBeUndefined()
    expect(view.statusReason).toBe('已取消')
    expect(view.code).toBeUndefined()
    expect(view.retriable).toBeUndefined()
  })

  it('handles a failed record with no error fields at all', () => {
    const view = describeGenerationFailure(makeRecord({}))
    expect(view).toEqual({
      message: undefined,
      statusReason: undefined,
      code: undefined,
      category: undefined,
      retriable: undefined,
      details: undefined,
    })
  })
})
