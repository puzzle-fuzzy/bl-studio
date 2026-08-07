import { useEffect, useState } from 'react'
import type { MediaJob } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'

const BASE_INTERVAL_MS = 1_500
const MAX_INTERVAL_MS = 15_000
const MAX_POLL_ATTEMPTS = 30
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

/**
 * 媒体任务轮询。非终态时轮询直至终态，间隔指数退避（1.5s → 15s 封顶），
 * 超过最大轮询次数后停止（避免永久失败任务无限高频打请求）。
 * （媒体任务走轮询而非 SSE；生成任务走 SSE。）
 */
export function useMediaJob(jobId: string | undefined): {
  job: MediaJob | null
  isLoading: boolean
  isPolling: boolean
} {
  const [job, setJob] = useState<MediaJob | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  useEffect(() => {
    // P1-10：jobId 置空（重选素材/关闭）时清掉过期 job，避免 UI 残留上一次的进度。
    if (jobId === undefined) {
      setJob(null)
      setIsPolling(false)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const pollOnce = async () => {
      try {
        const next = await apiClient.getMediaJob(jobId)
        if (cancelled) return
        setJob(next)
        if (TERMINAL_STATUSES.has(next.status)) {
          setIsPolling(false)
          return
        }
      } catch {
        if (cancelled) return
      }
      attempt += 1
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setIsPolling(false)
        return
      }
      const delay = Math.min(BASE_INTERVAL_MS * 2 ** (attempt - 1), MAX_INTERVAL_MS)
      timer = setTimeout(pollOnce, delay)
    }

    setIsLoading(true)
    setIsPolling(true)
    void pollOnce().finally(() => {
      if (!cancelled) setIsLoading(false)
    })

    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [jobId])

  return { job, isLoading, isPolling }
}
