import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreativeAssetDetail, CreativeAssetType, CreativeAssetVersionStatus } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { diffCreativeAssetMemberships } from '@/lib/creative-asset-memberships'

export const CREATIVE_ASSETS_PAGE_SIZE = 36

export interface CreativeAssetQuery {
  projectId?: string
  type?: CreativeAssetType
  versionStatus?: CreativeAssetVersionStatus
  q?: string
}

/**
 * 创意素材列表（原 creative-assets-store 迁移，Batch 0c）。
 * invalidate 保留翻页深度（useInfiniteQuery 默认行为）。
 */
export function useCreativeAssetList(query: CreativeAssetQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['creative', 'assets', 'list', query.projectId ?? 'all', query.type ?? 'all', query.versionStatus ?? 'all', query.q ?? ''],
    queryFn: ({ pageParam }) => apiClient.listCreativeAssets({
      limit: CREATIVE_ASSETS_PAGE_SIZE,
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.versionStatus !== undefined ? { versionStatus: query.versionStatus } : {}),
      ...(query.q !== undefined && query.q.trim().length > 0 ? { q: query.q.trim() } : {}),
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled,
  })
}

/** 单个素材详情；id 为空（路由无参）时不发起。 */
export function useCreativeAssetDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['creative', 'assets', 'detail', id],
    queryFn: () => apiClient.getCreativeAsset(id ?? ''),
    enabled: id !== undefined && id.length > 0,
  })
}

/** 详情页「所属项目」差异提交：attach/detach 后失效详情。 */
export function useSyncCreativeAssetMemberships() {
  const queryClient = useQueryClient()
  return async (assetId: string, asset: CreativeAssetDetail, projectIds: string[]): Promise<void> => {
    const diff = diffCreativeAssetMemberships(asset.projects.map(project => project.projectId), projectIds)
    for (const projectId of diff.attachProjectIds) {
      await apiClient.attachCreativeAssetToProject(projectId, { assetId })
    }
    for (const projectId of diff.detachProjectIds) {
      await apiClient.detachCreativeAssetFromProject(projectId, assetId)
    }
    await queryClient.invalidateQueries({ queryKey: ['creative', 'assets', 'detail', assetId] })
  }
}
