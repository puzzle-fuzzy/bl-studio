import { describe, expect, it } from 'vitest'
import { diffCreativeAssetMemberships } from './creative-asset-memberships'

describe('diffCreativeAssetMemberships', () => {
  it('returns only project relationships that changed', () => {
    expect(diffCreativeAssetMemberships(['project-a', 'project-b'], ['project-b', 'project-c'])).toEqual({
      attachProjectIds: ['project-c'],
      detachProjectIds: ['project-a'],
    })
  })

  it('deduplicates the requested project ids and preserves their order', () => {
    expect(diffCreativeAssetMemberships([], ['project-c', 'project-c', 'project-a'])).toEqual({
      attachProjectIds: ['project-c', 'project-a'],
      detachProjectIds: [],
    })
  })
})
