import type {
  AssetItem,
  CanvasExecutionTaskSummary,
} from '@bailian-studio/api-client'
import { apiClient } from '@bailian-studio/lib-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '@/stores/canvas-store'

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_MS = 15 * 60_000

export type CanvasExecutionStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

function assetUrl(asset: AssetItem): string | undefined {
  return asset.url ?? asset.downloadUrl ?? asset.thumbnailUrl
}

/**
 * Canvas-level execution lifecycle. The server is authoritative for task
 * progress; this hook only hydrates completed asset IDs into node previews.
 */
export function useCanvasExecution() {
  const documentId = useCanvasStore((state) => state.documentId)
  const revision = useCanvasStore((state) => state.revision)
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<CanvasExecutionStatus>('idle')
  const [taskId, setTaskId] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const stop = useCallback(() => {
    runIdRef.current += 1
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const applySummary = useCallback(
    async (
      summary: CanvasExecutionTaskSummary,
      runId: number,
    ): Promise<void> => {
      for (const node of summary.nodeStatuses) {
        if (runIdRef.current !== runId) return
        if (node.status === 'failed') {
          updateNodeData(node.nodeId, {
            status: 'error',
            errorMessage: node.error ?? '画布节点执行失败',
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

  const execute = useCallback(async () => {
    if (documentId === undefined || revision === undefined) {
      setError('画布尚未完成保存')
      setStatus('failed')
      return
    }
    stop()
    const runId = runIdRef.current
    setStatus('submitting')
    setError(undefined)
    try {
      const execution = await apiClient.executeCanvas(documentId, {
        expectedRevision: revision,
        idempotencyKey: `canvas:${documentId}:${revision}:${Date.now()}`,
      })
      if (runIdRef.current !== runId) return
      setTaskId(execution.id)
      await applySummary(execution, runId)
      if (
        execution.status === 'succeeded' ||
        execution.status === 'failed' ||
        execution.status === 'cancelled'
      ) {
        setStatus(execution.status)
        if (execution.error !== undefined) setError(execution.error)
        return
      }
      setStatus('running')
      const startedAt = Date.now()
      const poll = async (): Promise<void> => {
        if (runIdRef.current !== runId) return
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setStatus('failed')
          setError('画布执行超时，可稍后重新运行')
          return
        }
        try {
          const next = await apiClient.getCanvasExecution(
            documentId,
            execution.id,
          )
          if (runIdRef.current !== runId) return
          await applySummary(next, runId)
          if (
            next.status === 'succeeded' ||
            next.status === 'failed' ||
            next.status === 'cancelled'
          ) {
            setStatus(next.status)
            if (next.error !== undefined) setError(next.error)
            return
          }
        } catch {
          // Keep polling through transient network errors.
        }
        timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
      }
      timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    } catch (nextError) {
      if (runIdRef.current !== runId) return
      setStatus('failed')
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      )
    }
  }, [applySummary, documentId, revision, stop])

  useEffect(() => () => stop(), [stop])

  return { execute, stop, status, taskId, error }
}
