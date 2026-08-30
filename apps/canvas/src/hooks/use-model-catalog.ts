import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@bailian-studio/lib-client'

/** 画布内使用的模型目录查询（与 studio 共享同一缓存键）。 */
export function useModelCatalog() {
  return useQuery({
    queryKey: ['models', 'catalog'],
    queryFn: () => apiClient.getModels(),
    staleTime: 5 * 60_000,
  })
}
