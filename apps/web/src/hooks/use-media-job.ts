import { useEffect, useState } from 'react'
import type { MediaJob } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'

const POLL_INTERVAL_MS = 1_500
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

/**
 * 媒体任务轮询。非终态时每 1.5s 轮询一次，到达终态后停止。
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
    if (jobId === undefined) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const pollOnce = async () => {
      try {
        const next = await apiClient.getMediaJob(jobId)
        if (cancelled) return
        setJob(next)
        if (TERMINAL_STATUSES.has(next.status)) {
          setIsPolling(false)
          return
        }
        timer = setTimeout(pollOnce, POLL_INTERVAL_MS)
      } catch {
        if (cancelled) return
        timer = setTimeout(pollOnce, POLL_INTERVAL_MS)
      }
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
