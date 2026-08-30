import { useCallback, useEffect, useRef } from 'react'
import { apiClient } from '@bailian-studio/lib-client'

/** 画布节点生成轮询间隔（同 worker 的 PHASE_POLL_DELAY_MS）。 */
const POLL_INTERVAL_MS = 3_000
/** 最大轮询时长（视频可能几分钟）。 */
const MAX_POLL_MS = 5 * 60_000

interface GenerateOptions {
  modelId: string
  prompt: string
  /** 按模型 manifest 参数名绑定的真实资产 ID。 */
  assetRefs?: Record<string, string | string[]>
}

export interface MediaGenerationResult {
  /** 普通 generation 的稳定 ID；生成中时用于刷新页面后恢复轮询。 */
  generationId?: string
  url?: string
  kind?: 'image' | 'video'
  /** 生成产物在作品库中的资产 ID，可作为下游节点输入。 */
  assetId?: string
}

/**
 * 画布节点的生成生命周期管理（Krea 式手动触发）。
 *
 * createGeneration → 轮询 status → succeeded 时拉 artifacts 提取 readUrl。
 * 每次用户主动点击生成使用独立幂等键；同一节点的新一轮生成会取消旧轮询，
 * 避免旧请求在新结果之后覆盖节点状态。
 */
export function useCanvasGeneration(
  nodeId: string,
  onStatusChange: (status: 'generating' | 'ready' | 'error', result?: MediaGenerationResult, error?: string) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runIdRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const stopPolling = useCallback(() => {
    runIdRef.current += 1
    clearTimer()
  }, [clearTimer])

  useEffect(() => () => stopPolling(), [stopPolling])

  const pollGeneration = useCallback(async (
    recordId: string,
    runId: number,
    startedAt: number,
  ): Promise<void> => {
    if (runIdRef.current !== runId) return

    if (Date.now() - startedAt > MAX_POLL_MS) {
      clearTimer()
      onStatusChange('error', undefined, '生成超时')
      return
    }

    try {
      const record = await apiClient.getGeneration(recordId)
      if (runIdRef.current !== runId) return

      if (record.status === 'succeeded') {
        clearTimer()
        const artifacts = await apiClient.listGenerationArtifacts(recordId)
        if (runIdRef.current !== runId) return

        const media = artifacts.items.find(
          artifact => (artifact.kind === 'image' || artifact.kind === 'video') && artifact.readUrl !== undefined,
        )
        if (
          media === undefined
          || media.readUrl === undefined
          || (media.kind !== 'image' && media.kind !== 'video')
        ) {
          onStatusChange('error', undefined, '生成完成但未找到可展示的产物')
          return
        }

        // 生成产物会由后端投影到 user_assets；只把已存在的投影交给下游节点。
        // 资产查询失败不影响当前预览，但会让该节点暂时不能作为参考输入。
        let assetId: string | undefined
        try {
          const assets = await apiClient.listAssets({
            source: 'generation',
            kind: media.kind,
            limit: 100,
          })
          assetId = assets.items.find(item => item.id === `asset_generation_${media.id}`)?.id
        }
        catch {
          // 作品库查询失败时仍展示已完成的产物。
        }

        onStatusChange('ready', {
          url: media.readUrl,
          kind: media.kind,
          ...(assetId !== undefined ? { assetId } : {}),
        })
        return
      }

      if (record.status === 'failed' || record.status === 'cancelled') {
        clearTimer()
        const message = record.errorJson !== null && typeof record.errorJson === 'object' && 'message' in record.errorJson
          ? String(record.errorJson.message)
          : `生成${record.status === 'failed' ? '失败' : '已取消'}`
        onStatusChange('error', undefined, message)
        return
      }

      timerRef.current = setTimeout(() => void pollGeneration(recordId, runId, startedAt), POLL_INTERVAL_MS)
    }
    catch {
      // 网络抖动等：继续轮询，不中断。
      if (runIdRef.current === runId) {
        timerRef.current = setTimeout(() => void pollGeneration(recordId, runId, startedAt), POLL_INTERVAL_MS)
      }
    }
  }, [clearTimer, onStatusChange])

  const startPolling = useCallback((recordId: string, runId: number) => {
    const startedAt = Date.now()
    timerRef.current = setTimeout(() => void pollGeneration(recordId, runId, startedAt), POLL_INTERVAL_MS)
  }, [pollGeneration])

  const resume = useCallback((recordId: string) => {
    stopPolling()
    const runId = runIdRef.current
    onStatusChange('generating', { generationId: recordId })
    startPolling(recordId, runId)
  }, [onStatusChange, startPolling, stopPolling])

  const generate = useCallback(async (options: GenerateOptions) => {
    stopPolling()
    const runId = runIdRef.current
    onStatusChange('generating')

    try {
      const idempotencyKey = `canvas:${nodeId}:${Date.now()}`
      const response = await apiClient.createGeneration({
        modelId: options.modelId,
        params: { prompt: options.prompt },
        ...(options.assetRefs !== undefined && Object.keys(options.assetRefs).length > 0
          ? { assetRefs: options.assetRefs }
          : {}),
        idempotencyKey,
      })

      if (runIdRef.current !== runId) return

      const recordId = response.record.id
      onStatusChange('generating', { generationId: recordId })
      startPolling(recordId, runId)
    }
    catch (error) {
      if (runIdRef.current !== runId) return
      const message = error instanceof Error ? error.message : String(error)
      onStatusChange('error', undefined, message)
    }
  }, [nodeId, onStatusChange, startPolling, stopPolling])

  return { generate, resume, stopPolling }
}
