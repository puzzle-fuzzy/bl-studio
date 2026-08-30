import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/**
 * 某条生成记录的产物列表（原 generation-artifacts-store 迁移，Batch 0c）。
 * 按 recordId 键控缓存；产物持久化完成后 invalidate(['generations', recordId, 'artifacts'])。
 */
export function useGenerationArtifacts(recordId: string, enabled = true) {
  return useQuery({
    queryKey: ['generations', recordId, 'artifacts'],
    queryFn: () => apiClient.listGenerationArtifacts(recordId),
    enabled,
  })
}
