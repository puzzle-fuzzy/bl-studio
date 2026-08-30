import { useQueries } from '@tanstack/react-query'
import type { AssetItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'

/**
 * 按 id 批量解析参考资产（原 reference-assets-store 的声明式形态，Batch 0c）。
 * 返回 id→AssetItem 映射；缺失（未加载完/已删除/拉取失败）即无键，消费方
 * 原本就按 undefined 兜底。staleTime 5 分钟，retry 关闭对齐原实现（缺图静默）。
 */
export function useReferenceAssets(ids: readonly string[]): Record<string, AssetItem> {
  const unique = [...new Set(ids)]
  const queries = useQueries({
    queries: unique.map(id => ({
      queryKey: ['assets', 'item', id],
      queryFn: () => apiClient.getAsset(id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  })
  const map: Record<string, AssetItem> = {}
  unique.forEach((id, index) => {
    const data = queries[index]?.data
    if (data !== undefined) map[id] = data
  })
  return map
}
