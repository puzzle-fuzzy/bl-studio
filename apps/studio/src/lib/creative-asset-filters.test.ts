import { describe, expect, it } from 'vitest'
import { isCreativeAssetVersionFilter, matchesCreativeAssetVersionFilter } from './creative-asset-filters'

describe('creative asset version filters', () => {
  it('accepts supported URL filters and rejects unknown values', () => {
    expect(isCreativeAssetVersionFilter('candidate')).toBe(true)
    expect(isCreativeAssetVersionFilter('all')).toBe(true)
    expect(isCreativeAssetVersionFilter('pending')).toBe(false)
    expect(isCreativeAssetVersionFilter(null)).toBe(false)
  })

  it('matches all statuses while requiring an exact status for a specific filter', () => {
    expect(matchesCreativeAssetVersionFilter(undefined, 'all')).toBe(true)
    expect(matchesCreativeAssetVersionFilter('approved', 'approved')).toBe(true)
    expect(matchesCreativeAssetVersionFilter('candidate', 'approved')).toBe(false)
    expect(matchesCreativeAssetVersionFilter(undefined, 'candidate')).toBe(false)
  })
})
