import type { AssetItem, CanvasExecutionTaskSummary } from '@bailian-studio/api-client'
import { CanvasExecutionTaskSummarySchema } from '@bailian-studio/canvas-contracts'
import { apiClient } from '@bailian-studio/lib-client'
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
  const [error, setError] = useState<string | undefined>()

  const stop = useCallback(() => {
    runIdRef.current += 1
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }, [])

  const applySummary = useCallback(
    async (summary: CanvasExecutionTaskSummary, runId: number): Promise<void> => {
      for (const node of summary.nodeStatuses) {
        if (runIdRef.current !== runId) return
        if (node.status === 'failed') {
          updateNodeData(node.nodeId, {
            status: 'error',
            errorMessage: node.error ?? '画布节点执行失败',
          })
          continue
        }
        if (summary.status === 'cancelled' && node.status !== 'succeeded') {
          updateNodeData(node.nodeId, {
            status: 'error',
            errorMessage: node.error ?? '画布执行已取消',
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
          if (runIdRef.current !== runId) return
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
          updateNodeData(node.nodeId, {
            status: 'ready',
            resultAssetId: assetId,
            errorMessage: undefined,
          })
        }
      }
    },
    [updateNodeData],
  )

  const trackExecution = useCallback(
    async (
      execution: CanvasExecutionTaskSummary,
      runId: number,
      canvasId: string,
    ): Promise<void> => {
      if (runIdRef.current !== runId) return
      await applySummary(execution, runId)
      if (runIdRef.current !== runId) return
      setTaskId(execution.id)
      if (isTerminalExecution(execution)) {
        setStatus(toUiExecutionStatus(execution.status))
        if (execution.error !== undefined) setError(execution.error)
        return
      }
      setStatus('running')
      const startedAt = Date.now()
      let fallbackActive = false
      let finished = false

      const clearFallback = () => {
        fallbackActive = false
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const finish = async (next: CanvasExecutionTaskSummary): Promise<void> => {
        if (runIdRef.current !== runId || finished) return
        await applySummary(next, runId)
        if (runIdRef.current !== runId || finished) return
        if (isTerminalExecution(next)) {
          finished = true
          clearFallback()
          eventSourceRef.current?.close()
          eventSourceRef.current = null
          setStatus(toUiExecutionStatus(next.status))
          if (next.error !== undefined) setError(next.error)
          return
        }
        setStatus('running')
      }
      const poll = async (): Promise<void> => {
        if (runIdRef.current !== runId || finished || !fallbackActive) return
        if (Date.now() - startedAt > MAX_POLL_MS) {
          finished = true
          clearFallback()
          eventSourceRef.current?.close()
          eventSourceRef.current = null
          setStatus('failed')
          setError('画布执行超时，可稍后重新运行')
          return
        }
        try {
          const next = await apiClient.getCanvasExecution(canvasId, execution.id)
          await finish(next)
        } catch {
          // Keep polling through transient network errors.
        }
        if (runIdRef.current === runId && fallbackActive && !finished) {
          timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
        }
      }
      const startFallback = () => {
        if (runIdRef.current !== runId || finished || fallbackActive) return
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
          if (runIdRef.current !== runId || finished) return
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
    [applySummary],
  )

  const execute = useCallback(async () => {
    if (documentId === undefined || revision === undefined) {
      setError('画布尚未完成保存')
      setStatus('failed')
      return
    }
    stop()
    setTaskId(undefined)
    const runId = runIdRef.current
    setStatus('submitting')
    setError(undefined)
    try {
      const execution = await apiClient.executeCanvas(documentId, {
        expectedRevision: revision,
        idempotencyKey: `canvas:${documentId}:${revision}:${Date.now()}`,
      })
      if (runIdRef.current !== runId) return
      await trackExecution(execution, runId, documentId)
    } catch (nextError) {
      if (runIdRef.current !== runId) return
      setStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [documentId, revision, stop, trackExecution])

  const retryNode = useCallback(async (nodeId: string) => {
    if (
      documentId === undefined
      || taskId === undefined
      || (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled')
    ) return
    stop()
    const runId = runIdRef.current
    setStatus('submitting')
    setError(undefined)
    try {
      const execution = await apiClient.retryCanvasNode(documentId, taskId, nodeId, {
        idempotencyKey: `canvas-node:${documentId}:${taskId}:${nodeId}:${Date.now()}`,
      })
      if (runIdRef.current !== runId) return
      await trackExecution(execution, runId, documentId)
    } catch (nextError) {
      if (runIdRef.current !== runId) return
      setStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [documentId, status, stop, taskId, trackExecution])

  const cancel = useCallback(async () => {
    if (documentId === undefined || taskId === undefined || (status !== 'submitting' && status !== 'running')) return
    stop()
    const runId = runIdRef.current
    setStatus('cancelling')
    setError(undefined)
    try {
      const execution = await apiClient.cancelCanvasExecution(documentId, taskId)
      if (runIdRef.current !== runId) return
      await applySummary(execution, runId)
      setStatus(toUiExecutionStatus(execution.status))
      if (execution.error !== undefined) setError(execution.error)
    } catch (nextError) {
      if (runIdRef.current !== runId) return
      setStatus('running')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [applySummary, documentId, status, stop, taskId])

  const loadExecution = useCallback(async (executionId: string) => {
    if (documentId === undefined) return
    stop()
    const runId = runIdRef.current
    setTaskId(executionId)
    setError(undefined)
    try {
      const execution = await apiClient.getCanvasExecution(documentId, executionId)
      if (runIdRef.current !== runId) return
      await applySummary(execution, runId)
      if (runIdRef.current !== runId) return
      setStatus(toUiExecutionStatus(execution.status))
      if (execution.error !== undefined) setError(execution.error)
    } catch (nextError) {
      if (runIdRef.current !== runId) return
      setStatus('failed')
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [applySummary, documentId, stop])

  useEffect(() => () => stop(), [stop])

  return { execute, cancel, retryNode, loadExecution, stop, status, taskId, error }
}
