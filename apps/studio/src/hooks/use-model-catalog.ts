import { useQuery } from '@tanstack/react-query'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'

/**
 * 模型目录查询（原 model-catalog-store 迁移，Batch 0c）。
 * 目录低频变化，staleTime 5 分钟；缓存键 ['models','catalog'] 与 admin 侧共享。
 */
export function useModelCatalog() {
  const { data, isPending, error } = useQuery({
    queryKey: ['models', 'catalog'],
    queryFn: () => apiClient.getModels(),
    staleTime: 5 * 60_000,
  })
  return {
    models: data ?? [],
    isLoading: isPending,
    error: error !== null ? userErrorMessage(error) : null,
  }
}

/** 便捷 selector：按 id 取模型。 */
export function selectModelById(models: readonly ModelCatalogItem[], id: string): ModelCatalogItem | undefined {
  return models.find(model => model.id === id)
}
