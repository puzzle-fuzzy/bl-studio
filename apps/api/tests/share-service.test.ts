import { describe, expect, it } from 'vitest'
import { GenerationRepositoryError, type GenerationRecord, type GenerationRepository, type GenerationShare } from '@bailian-studio/generation-repository'
import { createShareUseCase } from '../src/modules/shares/service'

const share: GenerationShare = {
  id: 'share_1',
  recordId: 'gen_1',
  userId: 'user_1',
  includeParams: false,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
}

const record = (userId: string): GenerationRecord => ({
  id: 'gen_1',
  userId,
  modelId: 'qwen-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  category: 'image',
  inputParams: { prompt: 'lantern' },
  visibility: 'private',
  status: 'succeeded',
  costEstimate: 20,
  currency: 'CNY',
  pricingVersion: 'pricing-test',
  modelManifestHash: 'manifest-test',
  providerCancelStatus: 'not_requested',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
})

describe('share use cases', () => {
  it('creates a share through the repository and preserves explicit options', async () => {
    let received: unknown
    const repository = {
      createGenerationShare: async (input: Parameters<GenerationRepository['createGenerationShare']>[0]) => {
        received = input
        return share
      },
      getGenerationRecord: async () => undefined,
      getGenerationShareForRecord: async () => undefined,
      revokeGenerationShare: async () => undefined,
    }

    const result = await createShareUseCase({ repository }).create({
      recordId: 'gen_1',
      userId: 'user_1',
      includeParams: true,
      expiresAt: '2026-07-25T00:00:00.000Z',
    })

    expect(result).toEqual({ kind: 'created', share })
    expect(received).toEqual({
      recordId: 'gen_1',
      userId: 'user_1',
      includeParams: true,
      expiresAt: '2026-07-25T00:00:00.000Z',
    })
  })

  it('turns a repository ownership miss into a typed not-found result', async () => {
    const repository = {
      createGenerationShare: async () => {
        throw new GenerationRepositoryError('GENERATION_NOT_FOUND', 'not found')
      },
      getGenerationRecord: async () => undefined,
      getGenerationShareForRecord: async () => undefined,
      revokeGenerationShare: async () => undefined,
    }

    await expect(createShareUseCase({ repository }).create({ recordId: 'gen_1', userId: 'intruder' }))
      .resolves.toEqual({ kind: 'generation_not_found' })
  })

  it('keeps get and revoke ownership decisions in the use-case boundary', async () => {
    let revoked: unknown
    const repository = {
      createGenerationShare: async () => share,
      getGenerationRecord: async () => record('owner'),
      getGenerationShareForRecord: async () => share,
      revokeGenerationShare: async (input: Parameters<GenerationRepository['revokeGenerationShare']>[0]) => {
        revoked = input
        return share
      },
    }
    const useCase = createShareUseCase({ repository })

    await expect(useCase.get({ recordId: 'gen_1', userId: 'intruder' }))
      .resolves.toEqual({ kind: 'generation_not_found' })
    await expect(useCase.get({ recordId: 'gen_1', userId: 'owner' }))
      .resolves.toEqual({ kind: 'found', share })
    await expect(useCase.revoke({ recordId: 'gen_1', userId: 'owner' }))
      .resolves.toEqual({ kind: 'revoked', share })
    expect(revoked).toEqual({ recordId: 'gen_1', userId: 'owner' })
  })
})
