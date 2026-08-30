import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/**
 * 导演实体实时失效提示。
 *
 * 事件只负责唤醒查询，不直接写入候选或导演实体；断线后页面仍依靠
 * 查询缓存与用户操作继续工作，重新进入页面时会重新读取服务端事实。
 */
export function useDirectorEvents(projectId: string): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (projectId.length === 0) return

    let source: EventSource
    try {
      source = new EventSource(apiClient.generationEventsUrl(), { withCredentials: true })
    } catch {
      return
    }

    source.addEventListener('director.entities.changed', event => {
      let payload: { projectId?: unknown } = {}
      try {
        payload = JSON.parse((event as MessageEvent<string>).data) as { projectId?: unknown }
      } catch {
        return
      }
      if (payload.projectId === undefined || payload.projectId === projectId) {
        void queryClient.invalidateQueries({ queryKey: ['director', 'project', projectId] })
        void queryClient.invalidateQueries({ queryKey: ['director', 'entity-candidates', projectId] })
      }
    })

    return () => source.close()
  }, [projectId, queryClient])
}
