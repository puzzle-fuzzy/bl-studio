import { describe, expect, it, vi } from 'vitest'
import type { CreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { DailyGenerationUsage, GenerationEstimate, GenerationRepository } from '@bailian-studio/generation-repository'
import { createGenerationUseCase, enforceDailyGenerationLimits } from '../src/modules/generations/service'

const estimate: GenerationEstimate = {
  modelId: 'qwen-image', provider: 'dashscope', providerModel: 'qwen-image', category: 'image',
  params: { prompt: 'fixture' }, costEstimate: 20, currency: 'CNY',
}

const usage: DailyGenerationUsage = {
  attemptCount: 2, successfulCount: 0, generationCount: 2,
  estimatedCents: 40, chargedCents: 0, providerCostCents: 0,
}

describe('generation creative asset preparation', () => {
  it('compiles approved asset bindings into the stable generation input', async () => {
    const resolveGenerationBindings = vi.fn<CreativeAssetRepository['resolveGenerationBindings']>()
      .mockResolvedValue([{
        assetVersionId: 'version-character-1',
        assetVersionStatus: 'approved',
        assetType: 'character',
        role: 'character',
        position: 0,
        referenceIds: ['reference-front-1'],
        references: [{
          id: 'reference-front-1',
          userAssetId: 'user-image-1',
          mediaKind: 'image',
          role: 'front',
        }],
      }])
    const useCase = createGenerationUseCase({
      repository: {} as GenerationRepository,
      limits: { dailyQuotaMode: 'attempts' },
      creativeAssetRepository: { resolveGenerationBindings },
    })

    const prepared = await useCase.prepare({
      userId: 'user-1',
      modelId: 'qwen-image-edit',
      params: {
        prompt: '让 @图1 站在雨中',
        n: 1,
      },
      creativeContext: {
        protocolVersion: 1,
        purpose: 'shot_image',
        projectId: 'project-1',
        prompt: '让 @图1 站在雨中',
        assetBindings: [{
          assetVersionId: 'version-character-1',
          role: 'character',
          position: 0,
          referenceIds: ['reference-front-1'],
        }],
        recipe: { source: 'service-test' },
        capabilitySnapshot: { uiVersion: 'test' },
      },
    })

    expect(resolveGenerationBindings).toHaveBeenCalledWith({
      userId: 'user-1',
      context: expect.objectContaining({ projectId: 'project-1' }),
    })
    expect(prepared.params).toMatchObject({
      prompt: '让 <<<image_1>>> 站在雨中',
      n: 1,
    })
    expect(prepared.params).not.toHaveProperty('image')
    expect(prepared.assetRefs).toEqual({ image: ['user-image-1'] })
    expect(prepared.creativeContext?.modelId).toBe('qwen-image-edit')
    expect(prepared.creativeContext?.capabilitySnapshot.compilerProtocolVersion).toBe(1)
  })
})

describe('generation quota policy', () => {
  it('uses attemptCount by default so failed attempts cannot bypass a quota', () => {
    expect(() => enforceDailyGenerationLimits(estimate, usage, { dailyTaskLimit: 2, dailyQuotaMode: 'attempts' }))
      .toThrow(/Daily generation task limit exceeded/)
  })

  it('can explicitly count successful generations instead', () => {
    expect(() => enforceDailyGenerationLimits(estimate, usage, { dailyTaskLimit: 2, dailyQuotaMode: 'successful' })).not.toThrow()
  })
})
