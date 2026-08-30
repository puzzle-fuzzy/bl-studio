import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/** 积分余额的缓存键；生成结算/赠送后用 invalidate 失效。 */
export const creditBalanceKey = ['credits', 'balance'] as const

/**
 * 积分余额查询（原 credits-store 迁移，Batch 0c）。
 * - 覆盖全局默认开启窗口聚焦刷新：余额对焦点敏感（保留原实现行为）；
 * - staleTime 60s：徽标场景避免高频打点。
 */
export function useCreditBalance() {
  return useQuery({
    queryKey: creditBalanceKey,
    queryFn: () => apiClient.getCreditBalance(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

/** 供变更（生成完成、充值）后失效余额。 */
export function useInvalidateCreditBalance() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: creditBalanceKey })
}
