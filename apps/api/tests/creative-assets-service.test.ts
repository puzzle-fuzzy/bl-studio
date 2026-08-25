import { describe, expect, it, vi } from 'vitest'
import type { CreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import { CreativeAssetRepositoryError } from '@bailian-studio/creative-asset-repository'
import { createCreativeAssetUseCases } from '../src/modules/creative-assets/service'

function partialRepository(overrides: Partial<CreativeAssetRepository>): CreativeAssetRepository {
  return overrides as CreativeAssetRepository
}

describe('creative asset use cases', () => {
  it('turns an owned-resource miss into the stable project not-found error', async () => {
    const getProject = vi.fn<CreativeAssetRepository['getProject']>().mockResolvedValue(undefined)
    const useCases = createCreativeAssetUseCases({ repository: partialRepository({ getProject }) })

    await expect(useCases.getProject({ userId: 'user-a', projectId: 'project-missing' }))
      .rejects.toMatchObject({
        code: 'CREATIVE_PROJECT_NOT_FOUND',
        message: 'Creative project not found: project-missing',
      })
    expect(getProject).toHaveBeenCalledWith({ userId: 'user-a', projectId: 'project-missing' })
  })

  it('keeps the authenticated user and state operation inside the application boundary', async () => {
    const transitionVersion = vi.fn<CreativeAssetRepository['transitionVersion']>().mockResolvedValue({} as never)
    const removeReference = vi.fn<CreativeAssetRepository['removeReference']>().mockResolvedValue({} as never)
    const useCases = createCreativeAssetUseCases({ repository: partialRepository({ transitionVersion, removeReference }) })

    await useCases.transitionVersion({ userId: 'user-a', assetVersionId: 'version-1', status: 'candidate' })
    await useCases.removeReference({ userId: 'user-a', assetVersionId: 'version-1', referenceId: 'reference-1' })

    expect(transitionVersion).toHaveBeenCalledWith({ userId: 'user-a', assetVersionId: 'version-1', status: 'candidate' })
    expect(removeReference).toHaveBeenCalledWith({ userId: 'user-a', assetVersionId: 'version-1', referenceId: 'reference-1' })
  })

  it('keeps repository errors intact for state and validation failures', async () => {
    const failure = new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_STATE_INVALID', 'draft only')
    const transitionVersion = vi.fn<CreativeAssetRepository['transitionVersion']>().mockRejectedValue(failure)
    const useCases = createCreativeAssetUseCases({ repository: partialRepository({ transitionVersion }) })

    await expect(useCases.transitionVersion({ userId: 'user-a', assetVersionId: 'version-1', status: 'approved' }))
      .rejects.toBe(failure)
  })
})
