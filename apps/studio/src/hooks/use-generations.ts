import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GenerationListView, GenerationRecord } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { ACTIVE_GENERATION_STATUSES, GENERATIONS_PAGE_SIZE } from '@/lib/labels'

/**
 * 生成任务列表/详情（原 generations-store 迁移，Batch 0c 收官）。
 * 视图筛选进缓存键；invalidate 天然保留翻页深度并合并新首页（P1-01 作废）。
 * SSE 事件（use-generation-events）→ invalidateQueries(['generations'])。
 */

export const generationsRootKey = ['generations'] as const

export function useGenerationList(views: readonly GenerationListView[] = []) {
  return useInfiniteQuery({
    queryKey: ['generations', 'list', [...views].sort().join(',')],
    queryFn: ({ pageParam }) => apiClient.listGenerations({
      limit: GENERATIONS_PAGE_SIZE,
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      views: [...views],
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
  })
}

export function useGenerationDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['generations', 'detail', id],
    queryFn: () => apiClient.getGeneration(id ?? ''),
    enabled: id !== undefined && id.length > 0,
  })
}

/** 提交/取消/SSE 事件后失效整个生成域。 */
export function useInvalidateGenerations() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: generationsRootKey })
}

/** 缓存中是否存在活跃任务（降级轮询的门控，取代读 store.records）。 */
export function hasActiveGenerationInCache(queryClient: { getQueriesData: (f: { queryKey: unknown[] }) => Array<[unknown, unknown]> }): boolean {
  for (const [, data] of queryClient.getQueriesData({ queryKey: ['generations', 'list'] })) {
    const pages = (data as { pages?: Array<{ items?: GenerationRecord[] }> } | undefined)?.pages
    if (pages?.some(page => (page.items ?? []).some(record => ACTIVE_GENERATION_STATUSES.has(record.status)))) return true
  }
  return false
}
