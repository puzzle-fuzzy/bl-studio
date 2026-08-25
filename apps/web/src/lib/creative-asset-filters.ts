import type { CreativeAssetVersionStatus } from '@bailian-studio/api-client'

export type CreativeAssetVersionFilter = CreativeAssetVersionStatus | 'all'

export const CREATIVE_ASSET_VERSION_FILTERS: ReadonlyArray<{ value: CreativeAssetVersionFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'candidate', label: '待确认' },
  { value: 'approved', label: '已确认' },
  { value: 'generating', label: '生成中' },
  { value: 'draft', label: '草稿' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'archived', label: '已归档' },
]

const CREATIVE_ASSET_VERSION_FILTER_VALUES = new Set<string>(CREATIVE_ASSET_VERSION_FILTERS.map(item => item.value))

export function isCreativeAssetVersionFilter(value: string | null): value is CreativeAssetVersionFilter {
  return value !== null && CREATIVE_ASSET_VERSION_FILTER_VALUES.has(value)
}

export function matchesCreativeAssetVersionFilter(status: string | undefined, filter: CreativeAssetVersionFilter): boolean {
  return filter === 'all' || status === filter
}
