import type { CanvasExecutionTaskSummary, ListCanvasExecutionsResult } from '@bailian-studio/api-client'
import { apiClient } from '@bailian-studio/lib-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '@/stores/canvas-store'

const EXECUTION_HISTORY_PAGE_SIZE = 20

function mergeExecutionPage(
  current: readonly CanvasExecutionTaskSummary[],
  page: ListCanvasExecutionsResult,
): CanvasExecutionTaskSummary[] {
  const executions = new Map(current.map(execution => [execution.id, execution]))
  for (const execution of page.items) executions.set(execution.id, execution)
  return [...executions.values()]
}

/** Canvas 运行历史：分页状态与文档切换生命周期隔离在页面之外。 */
export function useCanvasExecutionHistory(
  documentId: string | undefined,
  enabled: boolean,
  refreshKey: string,
) {
  const [executions, setExecutions] = useState<CanvasExecutionTaskSummary[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const requestIdRef = useRef(0)
  const loadingRef = useRef(false)

  const load = useCallback(async (pageCursor?: string, append = false): Promise<boolean> => {
    if (documentId === undefined || loadingRef.current) return false
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    loadingRef.current = true
    setLoading(true)
    setError(undefined)
    try {
      const page = await apiClient.listCanvasExecutions(documentId, {
        limit: EXECUTION_HISTORY_PAGE_SIZE,
        ...(pageCursor === undefined ? {} : { cursor: pageCursor }),
      })
      if (
        requestId !== requestIdRef.current
        || useCanvasStore.getState().documentId !== documentId
      ) return false
      setExecutions(current => append ? mergeExecutionPage(current, page) : page.items)
      setCursor(page.nextCursor)
      return true
    } catch (nextError) {
      if (
        requestId === requestIdRef.current
        && useCanvasStore.getState().documentId === documentId
      ) setError(nextError instanceof Error ? nextError.message : String(nextError))
      return false
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [documentId])

  useEffect(() => {
    requestIdRef.current += 1
    loadingRef.current = false
    setExecutions([])
    setCursor(undefined)
    setError(undefined)
    setLoading(false)
  }, [documentId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load, refreshKey])

  return {
    cursor,
    error,
    executions,
    load,
    loading,
  }
}
