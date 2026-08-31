import type { AssetItem, CanvasExecutionTaskSummary } from '@bailian-studio/api-client'
import { CanvasExecutionTaskSummarySchema } from '@bailian-studio/canvas-contracts'
import { apiClient } from '@bailian-studio/lib-client'
import {
  canvasExecutionSessionKey,
  matchesCanvasExecutionSession,
} from '@/lib/canvas-execution-session'
import { findResumableCanvasExecution } from '@/lib/execution-recovery'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '@/stores/canvas-store'

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_MS = 15 * 60_000

export type CanvasExecutionStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

function assetUrl(asset: AssetItem): string | undefined {
  return asset.url ?? asset.downloadUrl ?? asset.thumbnailUrl
}

function isTerminalExecution(summary: CanvasExecutionTaskSummary): boolean {
  return summary.status === 'succeeded' || summary.status === 'failed' || summary.status === 'cancelled'
}

type SettledCanvasExecutionStatus = Exclude<CanvasExecutionStatus, 'idle' | 'submitting' | 'cancelling'>

function toUiExecutionStatus(status: CanvasExecutionTaskSummary['status']): SettledCanvasExecutionStatus {
  return status === 'queued' ? 'running' : status
}

/**
 * Canvas-level execution lifecycle. The server is authoritative for task
 * progress; this hook only hydrates completed asset IDs into node previews.
 */
export function useCanvasExecution() {
  const documentId = useCanvasStore(state => state.documentId)
  const revision = useCanvasStore(state => state.revision)
  const updateNodeData = useCanvasStore(state => state.updateNodeData)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<CanvasExecutionStatus>('idle')
  const [taskId, setTaskId] = useState<string | undefined>()
  const [execution, setExecution] = useState<CanvasExecutionTaskSummary | undefined>()
  const [error, setError] = useState<string | undefined>()
  const resumedSessionRef = useRef<string | undefined>(undefined)

  const setExecutionStatus = useCallback((next: CanvasExecutionStatus) => {
    setStatus(next)
    useCanvasStore.getState().setCanvasExecutionBusy(
      next === 'submitting' || next === 'running' || next === 'cancelling',
    )
  }, [])

  const stop = useCallback(() => {
    runIdRef.current += 1
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    useCanvasStore.getState().setCanvasExecutionBusy(false)
  }, [])

  const isCurrentSession = useCallback((runId: number, canvasId: string, canvasRevision?: number) => {
    if (runIdRef.current !== runId) return false
    const state = useCanvasStore.getState()
    if (canvasRevision === undefined) return state.documentId === canvasId
    return matchesCanvasExecutionSession(
      state.documentId === undefined || state.revision === undefined
        ? undefined
        : { documentId: state.documentId, revision: state.revision },
      { documentId: canvasId, revision: canvasRevision },
    )
  }, [])

  const applySummary = useCallback(
    async (
      summary: CanvasExecutionTaskSummary,
      runId: number,
      canvasId: string,
      canvasRevision?: number,
    ): Promise<void> => {
      for (const node of summary.nodeStatuses) {
        if (!isCurrentSession(runId, canvasId, canvasRevision)) return
        if (node.status === 'failed') {
          updateNodeData(node.nodeId, {
            status: 'error',
            errorMessage: formatNodeError(node.error, node.errorCode, '画布节点执行失败'),
          })
          continue
        }
        if (summary.status === 'cancelled' && node.status !== 'succeeded') {
          updateNodeData(node.nodeId, {
            status: 'error',
            errorMessage: formatNodeError(node.error, node.errorCode, '画布执行已取消'),
          })
          continue
        }
        if (node.status !== 'succeeded') {
          updateNodeData(node.nodeId, {
            status: 'generating',
            errorMessage: undefined,
          })
          continue
        }
        const assetId = node.assetIds?.[0]
        if (assetId === undefined) continue
        try {
          const asset = await apiClient.getAsset(assetId)
          if (!isCurrentSession(runId, canvasId, canvasRevision)) return
          const url = assetUrl(asset)
          updateNodeData(node.nodeId, {
            status: 'ready',
            resultAssetId: asset.id,
            resultKind: asset.kind === 'video' ? 'video' : 'image',
            ...(url === undefined ? {} : { resultUrl: url }),
            errorMessage: undefined,
          })
        } catch {
          // The server task already records the stable asset ID. A temporary
          // signed URL failure should not turn a successful node into an error.
          if (!isCurrentSession(runId, canvasId, canvasRevision)) return
          updateNodeData(node.nodeId, {
            status: 'ready',
            resultAssetId: assetId,
            errorMessage: undefined,
          })
        }
      }
    },
    [isCurrentSession, updateNodeData],
  )

  const trackExecution = useCallback(
    async (
      execution: CanvasExecutionTaskSummary,
      runId: number,
      canvasId: string,
      canvasRevision: number,
    ): Promise<void> => {
      if (!isCurrentSession(runId, canvasId, canvasRevision)) return
      setExecution(execution)
      await applySummary(execution, runId, canvasId, canvasRevision)
      if (!isCurrentSession(runId, canvasId, canvasRevision)) return
      setTaskId(execution.id)
      if (isTerminalExecution(execution)) {
        setExecutionStatus(toUiExecutionStatus(execution.status))
        if (execution.error !== undefined) setError(execution.error)
        return
      }
      setExecutionStatus('running')
      const startedAt = Date.now()
      let fallbackActive = false
      let finished = false

      const clearFallback = () => {
        fallbackActive = false
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const finish = async (next: CanvasExecutionTaskSummary): Promise<void> => {
        if (!isCurrentSession(runId, canvasId, canvasRevision) || finished) return
        setExecution(next)
        await applySummary(next, runId, canvasId, canvasRevision)
        if (!isCurrentSession(runId, canvasId, canvasRevision) || finished) return
        if (isTerminalExecution(next)) {
          finished = true
          clearFallback()
          eventSourceRef.current?.close()
          eventSourceRef.current = null
          setExecutionStatus(toUiExecutionStatus(next.status))
          if (next.error !== undefined) setError(next.error)
          return
        }
        setExecutionStatus('running')
      }
      const poll = async (): Promise<void> => {
        if (!isCurrentSession(runId, canvasId, canvasRevision) || finished || !fallbackActive) return
        if (Date.now() - startedAt > MAX_POLL_MS) {
          finished = true
          clearFallback()
          eventSourceRef.current?.close()
          eventSourceRef.current = null
          setExecutionStatus('failed')
          setError('画布执行超时，可稍后重新运行')
          return
        }
        try {
          const next = await apiClient.getCanvasExecution(canvasId, execution.id)
          await finish(next)
        } catch {
          // Keep polling through transient network errors.
        }
        if (isCurrentSession(runId, canvasId, canvasRevision) && fallbackActive && !finished) {
          timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
        }
      }
      const startFallback = () => {
        if (!isCurrentSession(runId, canvasId, canvasRevision) || finished || fallbackActive) return
        fallbackActive = true
        void poll()
      }

      try {
        const source = new EventSource(apiClient.canvasExecutionEventsUrl(canvasId, execution.id), {
          withCredentials: true,
        })
        eventSourceRef.current = source
        source.addEventListener('open', clearFallback)
        source.addEventListener('error', startFallback)
        source.addEventListener('canvas.execution', event => {
          if (!isCurrentSession(runId, canvasId, canvasRevision) || finished) return
          let next: CanvasExecutionTaskSummary
          try {
            next = CanvasExecutionTaskSummarySchema.parse(JSON.parse((event as MessageEvent<string>).data))
          } catch {
            return
          }
          if (next.id !== execution.id) return
          void finish(next)
        })
      } catch {
        // 浏览器不支持 EventSource 时，回退到已有的任务查询轮询。
        startFallback()
      }
    },
    [applySummary, isCurrentSession, setExecutionStatus],
  )

  const execute = useCallback(async () => {
    if (documentId === undefined || revision === undefined) {
      setError('画布尚未完成保存')
      setExecutionStatus('failed')
      return
    }
    stop()
    setTaskId(undefined)
    setExecution(undefined)
    const runId = runIdRef.current
    setExecutionStatus('submitting')
    setError(undefined)
    try {
      const execution = await apiClient.executeCanvas(documentId, {
        expectedRevision: revision,
        idempotencyKey: `canvas:${documentId}:${revision}:${Date.now()}`,
      })
      if (!isCurrentSession(runId, documentId, revision)) return
      await trackExecution(execution, runId, documentId, revision)
    } catch (nextError) {
      if (!isCurrentSession(runId, documentId, revision)) return
      setExecutionStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [documentId, isCurrentSession, revision, setExecutionStatus, stop, trackExecution])

  const retryNode = useCallback(async (nodeId: string) => {
    if (
      documentId === undefined
      || revision === undefined
      || taskId === undefined
      || (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled')
    ) return
    stop()
    const runId = runIdRef.current
    setExecutionStatus('submitting')
    setError(undefined)
    try {
      const execution = await apiClient.retryCanvasNode(documentId, taskId, nodeId, {
        idempotencyKey: `canvas-node:${documentId}:${taskId}:${nodeId}:${Date.now()}`,
      })
      if (!isCurrentSession(runId, documentId, revision)) return
      await trackExecution(execution, runId, documentId, revision)
    } catch (nextError) {
      if (!isCurrentSession(runId, documentId, revision)) return
      setExecutionStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [documentId, isCurrentSession, revision, setExecutionStatus, status, stop, taskId, trackExecution])

  const cancel = useCallback(async () => {
    if (
      documentId === undefined
      || revision === undefined
      || taskId === undefined
      || (status !== 'submitting' && status !== 'running')
    ) return
    stop()
    const runId = runIdRef.current
    setExecutionStatus('cancelling')
    setError(undefined)
    try {
      const execution = await apiClient.cancelCanvasExecution(documentId, taskId)
      if (!isCurrentSession(runId, documentId, revision)) return
      setExecution(execution)
      await applySummary(execution, runId, documentId, revision)
      if (!isCurrentSession(runId, documentId, revision)) return
      setExecutionStatus(toUiExecutionStatus(execution.status))
      if (execution.error !== undefined) setError(execution.error)
    } catch (nextError) {
      if (!isCurrentSession(runId, documentId, revision)) return
      setExecutionStatus('running')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [applySummary, documentId, isCurrentSession, revision, setExecutionStatus, status, stop, taskId])

  const loadExecution = useCallback(async (executionId: string) => {
    if (documentId === undefined) return
    stop()
    const runId = runIdRef.current
    setTaskId(executionId)
    setExecution(undefined)
    setError(undefined)
    try {
      const execution = await apiClient.getCanvasExecution(documentId, executionId)
      if (!isCurrentSession(runId, documentId)) return
      setExecution(execution)
      await applySummary(execution, runId, documentId)
      if (!isCurrentSession(runId, documentId)) return
      setExecutionStatus(toUiExecutionStatus(execution.status))
      if (execution.error !== undefined) setError(execution.error)
    } catch (nextError) {
      if (!isCurrentSession(runId, documentId)) return
      setExecutionStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [applySummary, documentId, isCurrentSession, setExecutionStatus, stop])

  // 页面刷新后接管当前 revision 的未结束任务；旧 revision 只保留在历史面板中。
  useEffect(() => {
    const sessionKey = documentId === undefined || revision === undefined
      ? undefined
      : canvasExecutionSessionKey({ documentId, revision })
    if (sessionKey === resumedSessionRef.current) return
    resumedSessionRef.current = sessionKey
    stop()
    setTaskId(undefined)
    setExecution(undefined)
    setError(undefined)
    setExecutionStatus('idle')
    if (documentId === undefined || revision === undefined) return
    const requestRunId = runIdRef.current
    let disposed = false
    void (async () => {
      try {
        const page = await apiClient.listCanvasExecutions(documentId, { limit: 20 })
        if (disposed || !isCurrentSession(requestRunId, documentId, revision)) return
        const execution = findResumableCanvasExecution(page.items, revision)
        if (execution === undefined) return
        await trackExecution(execution, requestRunId, documentId, revision)
      }
      catch {
        // 自动恢复失败不影响页面交互；用户仍可从运行记录手动重新载入。
      }
    })()
    return () => { disposed = true }
  }, [documentId, isCurrentSession, revision, setExecutionStatus, stop, trackExecution])

  useEffect(() => () => stop(), [stop])

  return { execute, cancel, retryNode, loadExecution, stop, status, taskId, execution, error }
}

function formatNodeError(error: string | undefined, errorCode: string | undefined, fallback: string): string {
  const message = error ?? fallback
  return errorCode === undefined ? message : `${message}（${errorCode}）`
}
