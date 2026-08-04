import { describe, expect, it } from 'vitest'
import type { DailyGenerationUsage, GenerationEstimate } from '@bailian-studio/generation-repository'
import { enforceDailyGenerationLimits } from '../src/modules/generations/service'

const estimate: GenerationEstimate = {
  modelId: 'qwen-image', provider: 'dashscope', providerModel: 'qwen-image', category: 'image',
  params: { prompt: 'fixture' }, costEstimate: 20, currency: 'CNY',
}

const usage: DailyGenerationUsage = {
  attemptCount: 2, successfulCount: 0, generationCount: 2,
  estimatedCents: 40, chargedCents: 0, providerCostCents: 0,
}

describe('generation quota policy', () => {
  it('uses attemptCount by default so failed attempts cannot bypass a quota', () => {
    expect(() => enforceDailyGenerationLimits(estimate, usage, { dailyTaskLimit: 2, dailyQuotaMode: 'attempts' }))
      .toThrow(/Daily generation task limit exceeded/)
  })

  it('can explicitly count successful generations instead', () => {
    expect(() => enforceDailyGenerationLimits(estimate, usage, { dailyTaskLimit: 2, dailyQuotaMode: 'successful' })).not.toThrow()
  })
})
