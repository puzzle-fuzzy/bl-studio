import { useInfiniteQuery } from '@tanstack/react-query'
import type { AssetSort } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { ASSETS_PAGE_SIZE } from '@/lib/labels'

export interface AssetQuery {
  kind?: string
  source?: string
  q?: string
  sort?: AssetSort
}

/**
 * 统一素材列表（原 assets-store 迁移，Batch 0c）。
 * useInfiniteQuery 的 invalidate 天然保留已翻页深度（重取所有已加载页），
 * 取代原 P1-01 的手工「新首页 + 已加载深页合并」逻辑。
 */
export function useAssetList(query: AssetQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['assets', 'list', query.kind ?? 'all', query.source ?? 'all', query.sort ?? 'time', query.q ?? ''],
    queryFn: ({ pageParam }) => apiClient.listAssets({
      limit: ASSETS_PAGE_SIZE,
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.source !== undefined ? { source: query.source } : {}),
      ...(query.sort !== undefined ? { sort: query.sort } : {}),
      ...(query.q !== undefined && query.q.length > 0 ? { q: query.q } : {}),
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled,
  })
}
