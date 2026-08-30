import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreativeProject, CreateCreativeProjectRequest, CreativeProjectDetail } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'

const PROJECTS_PAGE_SIZE = 100

/**
 * 创意项目（原 creative-projects-store 迁移，Batch 0c）。
 * 列表/详情查询 + 创建/资产归属变更的失效语义。
 */

export function useCreativeProjectList(q = '') {
  return useInfiniteQuery({
    queryKey: ['creative', 'projects', 'list', q],
    queryFn: ({ pageParam }) => apiClient.listCreativeProjects({
      limit: PROJECTS_PAGE_SIZE,
      ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      ...(q.trim().length > 0 ? { q: q.trim() } : {}),
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
  })
}

export function useCreativeProjectDetail(projectId: string | undefined) {
  return useQuery({
    queryKey: ['creative', 'projects', 'detail', projectId],
    queryFn: () => apiClient.getCreativeProject(projectId ?? ''),
    enabled: projectId !== undefined && projectId.length > 0,
  })
}

/** 创建项目后失效项目列表。 */
export function useCreateCreativeProject() {
  const queryClient = useQueryClient()
  return async (input: CreateCreativeProjectRequest): Promise<CreativeProject> => {
    const project = await apiClient.createCreativeProject(input)
    await queryClient.invalidateQueries({ queryKey: ['creative', 'projects', 'list'] })
    return project
  }
}

/** 逐个挂载资产（保持原 sortOrder 追加语义），完成后失效项目详情。 */
export function useAttachCreativeProjectAssets() {
  const queryClient = useQueryClient()
  return async (projectId: string, project: CreativeProjectDetail | undefined, assetIds: string[]): Promise<void> => {
    const uniqueAssetIds = [...new Set(assetIds)]
    if (uniqueAssetIds.length === 0) return
    const existingCount = project?.assets.length ?? 0
    try {
      for (const [index, assetId] of uniqueAssetIds.entries()) {
        await apiClient.attachCreativeAssetToProject(projectId, {
          assetId,
          sortOrder: existingCount + index,
        })
      }
    }
    finally {
      await queryClient.invalidateQueries({ queryKey: ['creative', 'projects', 'detail', projectId] })
    }
  }
}

/** 逐个移出资产，完成后失效项目详情。 */
export function useDetachCreativeProjectAssets() {
  const queryClient = useQueryClient()
  return async (projectId: string, assetIds: string[]): Promise<void> => {
    const uniqueAssetIds = [...new Set(assetIds)]
    if (uniqueAssetIds.length === 0) return
    try {
      for (const assetId of uniqueAssetIds) {
        await apiClient.detachCreativeAssetFromProject(projectId, assetId)
      }
    }
    finally {
      await queryClient.invalidateQueries({ queryKey: ['creative', 'projects', 'detail', projectId] })
    }
  }
}
