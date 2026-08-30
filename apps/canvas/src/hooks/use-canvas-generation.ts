import { useCallback, useEffect, useRef } from 'react'
import { apiClient } from '@bailian-studio/lib-client'

/** 画布节点生成轮询间隔（同 worker 的 PHASE_POLL_DELAY_MS）。 */
const POLL_INTERVAL_MS = 3_000
/** 最大轮询时长（视频可能几分钟）。 */
const MAX_POLL_MS = 5 * 60_000

interface GenerateOptions {
  modelId: string
  prompt: string
  /** 已按当前模型 manifest 映射的参数；不在 hook 内猜测 provider 字段名。 */
  params?: Record<string, unknown>
  /** 按模型 manifest 参数名绑定的真实资产 ID。 */
  assetRefs?: Record<string, string | string[]>
}

async function resolveGeneratedAssetId(
  artifact: { id: string; assetId?: string },
  kind: 'image' | 'video',
): Promise<string | undefined> {
  if (artifact.assetId !== undefined) return artifact.assetId

  // 兼容尚未返回 assetId 的旧 API；新 API 的正常路径不再猜测投影 ID。
  const projectionId = `asset_generation_${artifact.id}`
  try {
    const asset = await apiClient.getAsset(projectionId)
    if (asset.kind === kind) return asset.id
  }
  catch {
    // 兼容旧部署或资产投影短暂延迟，继续使用列表回退。
  }

  try {
    const assets = await apiClient.listAssets({
      source: 'generation',
      kind,
      limit: 100,
    })
    return assets.items.find(item => item.id === projectionId)?.id
  }
  catch {
    return undefined
  }
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

        // 生成产物读模型会返回已投影 user_assets 的权威 assetId，避免资产量超过列表
        // 窗口时丢失下游绑定。旧 API 没有该字段时才走兼容回退；读取失败仍展示预览，
        // 但暂时不能作为参考输入。
        const assetId = await resolveGeneratedAssetId(media, media.kind)

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

  const cancel = useCallback(async (recordId: string): Promise<'cancelled' | 'pending'> => {
    // 取消请求本身会让当前轮询失效；如果服务端只记录了 processing 状态的
    // cancelRequestedAt，则重新接管轮询，等待 worker 把 generation 收口为终态。
    stopPolling()

    try {
      const response = await apiClient.cancelGeneration(recordId)
      if (response.record.status === 'cancelled') {
        onStatusChange('error', undefined, '生成已取消')
        return 'cancelled'
      }

      resume(recordId)
      return 'pending'
    }
    catch (error) {
      // 网络失败不能让节点停在“无轮询”的假状态；恢复跟踪并把错误交给 UI 展示。
      resume(recordId)
      throw error
    }
  }, [onStatusChange, resume, stopPolling])

  const generate = useCallback(async (options: GenerateOptions) => {
    stopPolling()
    const runId = runIdRef.current
    onStatusChange('generating')

    try {
      const idempotencyKey = `canvas:${nodeId}:${Date.now()}`
      const response = await apiClient.createGeneration({
        modelId: options.modelId,
        params: { prompt: options.prompt, ...(options.params ?? {}) },
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

  return { cancel, generate, resume, stopPolling }
}
