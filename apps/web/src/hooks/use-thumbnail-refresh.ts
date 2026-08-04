import { useEffect } from 'react'
import { THUMBNAIL_REFRESH_MS } from '@/lib/labels'

/**
 * 缩略图自动刷新。
 *
 * 缩略图在服务端异步生成（thumbnailStatus = queued/processing）。检测到待生成
 * 缩略图时，每 2s 自动触发刷新，直到全部 ready，避免用户手动刷新。
 */

interface ThumbnailCandidate {
  thumbnailStatus?: string | null
}

export function hasPendingThumbnails(items: readonly ThumbnailCandidate[]): boolean {
  return items.some(
    item => item.thumbnailStatus === 'queued' || item.thumbnailStatus === 'processing',
  )
}

/** 当存在待生成缩略图时周期调用 onRefresh。 */
export function usePendingThumbnailRefresh(
  pending: boolean,
  onRefresh: () => void,
  intervalMs = THUMBNAIL_REFRESH_MS,
): void {
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(onRefresh, intervalMs)
    return () => clearInterval(timer)
  }, [pending, onRefresh, intervalMs])
}
