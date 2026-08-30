import { useEffect } from 'react'
import { apiClient } from '@/lib/api'
import { THUMBNAIL_REFRESH_MS } from '@/lib/labels'
import { hasActiveGenerationInCache } from '@/hooks/use-generations'
import { useQueryClient } from '@tanstack/react-query'


/**
 * SSE 实时订阅（一次挂载，跨路由常开）。
 *
 * 设计继承两版最佳实践：SSE 事件只作为「失效提示」，不直接写数据——
 * 事件携带 recordId，触发 `refreshRecord(id)` 拉取最新详情；同时失效资产缓存。
 * 流不可用时降级为按需轮询（仅当存在活跃任务且页面可见）。
 */
export function useGenerationEvents(enabled: boolean): void {
  const invalidateGenerations = () => queryClient.invalidateQueries({ queryKey: ['generations'] })
  const refreshRecord = (_id: string) => invalidateGenerations()
  const refresh = invalidateGenerations
  const queryClient = useQueryClient()
  // SSE 事件作为失效提示：缩略图就绪等事件让素材列表重取（保留翻页深度）。
  const invalidateAssets = () => queryClient.invalidateQueries({ queryKey: ['assets', 'list'] })

  useEffect(() => {
    if (!enabled) return

    let source: EventSource | null = null

    const connect = () => {
      (void 'connecting')
      let next: EventSource
      try {
        next = new EventSource(apiClient.generationEventsUrl(), { withCredentials: true })
      } catch {
        (void 'unsupported')
        return
      }
      source = next

      next.addEventListener('open', () => (void 'connected'))

      // P1-17：游标过期信号——服务端在 Last-Event-ID 已不可用时发出。
      // 立即关闭并用全新 EventSource 重连（清掉 stale 的 Last-Event-ID），
      // 否则浏览器会带同一游标无限重试。后端事件名与 routes.ts 对齐。
      next.addEventListener('cursor-expired', () => {
        next.close()
        connect()
      })

      // EventSource 断线后自动重连；这里只更新降级状态。
      next.addEventListener('error', () => (void 'degraded'))

      const onEvent = (event: MessageEvent<string>) => {
        // 心跳/connected 事件没有 id，忽略，避免每次重连都刷新列表。
        if (event.lastEventId === '') return
        let payload: { recordId?: string } = {}
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }
        const recordId = payload.recordId
        if (recordId !== undefined) {
          void refreshRecord(recordId)
          invalidateAssets()
        }
      }

      for (const name of [
        'generation.status',
        'generation.completed',
        'generation.failed',
        'generation.cancelled',
      ]) {
        next.addEventListener(name, onEvent)
      }

      // 社交通知事件（点赞/收藏）：只做「刷新提示」，从服务端拉最新通知与未读数。
      next.addEventListener('notification', () => {
        queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      })

      // 导演实体审核是实时失效提示；数据仍从 API 重新读取，避免 SSE payload 成为第二份事实来源。
      next.addEventListener('director.entities.changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['director'] })
      })
    }

    connect()

    // 降级轮询：仅当有活跃任务且页面可见时刷新列表。
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (hasActiveGenerationInCache(queryClient)) refresh()
    }, THUMBNAIL_REFRESH_MS * 5)

    return () => {
      source?.close()
      clearInterval(timer)
    }
  }, [enabled, refreshRecord, refresh, invalidateAssets])
}
