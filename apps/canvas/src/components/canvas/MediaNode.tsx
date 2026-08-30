import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { cn } from '@bailian-studio/lib-client'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import { ImagePlus, Loader2, RefreshCw, Send, Video, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useCanvasGeneration } from '@/hooks/use-canvas-generation'
import { useModelCatalog } from '@/hooks/use-model-catalog'
import {
  buildCanvasAssetRefs,
  type CanvasReferenceAsset,
  canvasMediaParameters,
  canvasReferenceCapacityByKind,
} from '@/lib/generation-refs'
import { useCanvasStore } from '@/stores/canvas-store'
import { AssetPicker } from './AssetPicker'

/**
 * 画布生成节点（Krea 式）。
 *
 * 状态机：empty → generating → ready | error。
 * 连线语义：入边 = 参考图（上游节点产物作为本节点参考输入），出边 = 本节点产物。
 * 手动触发生成，非拓扑执行——用户点击「生成」按钮发起。
 */

export type MediaNodeStatus = 'empty' | 'generating' | 'ready' | 'error'
export type MediaKind = 'image' | 'video'

export interface MediaNodeData extends Record<string, unknown> {
  kind: MediaKind
  status: MediaNodeStatus
  prompt: string
  modelId: string
  resultUrl?: string
  resultKind?: MediaKind
  resultAssetId?: string
  errorMessage?: string
  /** 仅保留旧版本画布数据的兼容展示；新连接使用上游资产 ID。 */
  referenceUrls: string[]
  /** 用户从资产库选择的稳定资产 ID；生成时按模型参数映射到 assetRefs。 */
  referenceAssetIds?: string[]
  /** 静态资产 ID 对应的媒体类型；用于模型切换和版本恢复时保持参数分配稳定。 */
  referenceAssetKinds?: Record<string, MediaKind>
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
}

interface ConnectedReference {
  edgeId: string
  sourceId: string
  url: string
  kind: MediaKind
  assetId?: string
}

const ASPECT_CLASS: Record<string, string> = {
  '1:1': 'aspect-square',
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
  '4:3': 'aspect-[4/3]',
  '3:4': 'aspect-[3/4]',
}

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const

export const MediaNode = memo(({ data, id, selected }: NodeProps) => {
  const nodeData = data as MediaNodeData
  const [isEditing, setIsEditing] = useState(false)
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false)
  const { data: models } = useModelCatalog()
  const nodes = useCanvasStore(state => state.nodes)
  const edges = useCanvasStore(state => state.edges)
  const updateNodeData = useCanvasStore(state => state.updateNodeData)
  const onEdgesChange = useCanvasStore(state => state.onEdgesChange)

  // 从画布真实入边读取上游产物，避免使用已被服务端拒绝的 URL 参数。
  const connectedReferences = useMemo<ConnectedReference[]>(() => {
    return edges.flatMap(edge => {
      if (edge.target !== id) return []
      const source = nodes.find(node => node.id === edge.source)
      if (source === undefined) return []
      const sourceData = source.data as Partial<MediaNodeData>
      if (sourceData.status !== 'ready' || sourceData.resultUrl === undefined) return []
      return [{
        edgeId: edge.id,
        sourceId: source.id,
        url: sourceData.resultUrl,
        kind: sourceData.resultKind ?? sourceData.kind ?? 'image',
        ...(sourceData.resultAssetId !== undefined ? { assetId: sourceData.resultAssetId } : {}),
      }]
    })
  }, [edges, id, nodes])

  const nodeKind = nodeData.kind ?? nodeData.resultKind ?? 'image'
  const prompt = nodeData.prompt ?? ''
  const modelId = nodeData.modelId ?? ''
  const referenceUrls = nodeData.referenceUrls ?? []
  const referenceAssetIds = nodeData.referenceAssetIds ?? []
  const referenceAssetKinds = nodeData.referenceAssetKinds ?? {}
  const aspectRatio = nodeData.aspectRatio ?? '1:1'
  const availableModels = useMemo(
    () => (models ?? []).filter((model: ModelCatalogItem) => (
      model.availability?.enabled === true && model.category === nodeKind
    )),
    [models, nodeKind],
  )
  const selectedModel = useMemo(
    () => (models ?? []).find((model: ModelCatalogItem) => model.id === modelId),
    [modelId, models],
  )
  const mediaParameters = useMemo(() => canvasMediaParameters(selectedModel), [selectedModel])
  const selectableReferenceKinds = useMemo<MediaKind[]>(
    () => [...new Set(mediaParameters.map(parameter => parameter.mediaKind))],
    [mediaParameters],
  )
  const referenceCapacityByKind = useMemo(
    () => canvasReferenceCapacityByKind(mediaParameters),
    [mediaParameters],
  )
  const referenceAssets = useMemo<CanvasReferenceAsset[]>(
    () => [...connectedReferences
      .filter((reference): reference is ConnectedReference & { assetId: string } => reference.assetId !== undefined)
      .map(reference => ({ assetId: reference.assetId, kind: reference.kind })),
      ...referenceAssetIds.map(assetId => ({
        assetId,
        kind: referenceAssetKinds[assetId] ?? nodeKind,
      })),
    ].filter((reference, index, all) => all.findIndex(item => item.assetId === reference.assetId) === index),
    [connectedReferences, nodeKind, referenceAssetIds, referenceAssetKinds],
  )
  const assetRefs = useMemo(
    () => buildCanvasAssetRefs(mediaParameters, referenceAssets),
    [mediaParameters, referenceAssets],
  )
  const boundAssetIds = useMemo(
    () => new Set(Object.values(assetRefs).flatMap(value => Array.isArray(value) ? value : [value])),
    [assetRefs],
  )
  const hasMissingUpstreamAsset = connectedReferences.some(reference => reference.assetId === undefined)
  const hasUnboundReference = connectedReferences.some(reference => (
    reference.assetId !== undefined && !boundAssetIds.has(reference.assetId)
  )) || referenceAssetIds.some(assetId => !boundAssetIds.has(assetId))
  const hasLegacyReference = connectedReferences.length === 0
    && referenceAssetIds.length === 0
    && referenceUrls.length > 0
  const missingRequiredReference = mediaParameters.some(parameter => (
    parameter.required === true && assetRefs[parameter.name] === undefined
  ))
  const referenceError = hasMissingUpstreamAsset || hasLegacyReference
    ? '请先重新生成上游节点，等待产物归档后再连接'
    : hasUnboundReference
      ? '当前模型的参考槽位不足或类型不匹配，请减少已选素材或更换模型'
    : missingRequiredReference
      ? '当前模型需要连接匹配类型的参考素材'
      : undefined

  const onStatusChange = useCallback((
    status: 'generating' | 'ready' | 'error',
    result?: { url: string; kind: MediaKind; assetId?: string },
    error?: string,
  ) => {
    updateNodeData(id, {
      status,
      ...(result !== undefined
        ? { resultUrl: result.url, resultKind: result.kind, resultAssetId: result.assetId }
        : {}),
      ...(status === 'generating' ? { errorMessage: undefined } : {}),
      ...(error !== undefined ? { errorMessage: error } : {}),
    })
  }, [id, updateNodeData])

  const { generate } = useCanvasGeneration(id, onStatusChange)

  // 新节点按类型自动选择第一个可用模型，避免用户面对空的模型选择器。
  useEffect(() => {
    if (modelId === '' && availableModels[0] !== undefined) {
      updateNodeData(id, { modelId: availableModels[0].id })
    }
  }, [availableModels, id, modelId, updateNodeData])

  const handleGenerate = useCallback(() => {
    if (
      modelId.length === 0
      || prompt.trim().length === 0
      || referenceError !== undefined
    ) return

    void generate({
      modelId,
      prompt: prompt.trim(),
      ...(Object.keys(assetRefs).length > 0 ? { assetRefs } : {}),
    })
  }, [assetRefs, generate, modelId, prompt, referenceError])

  const removeReference = useCallback((edgeId: string) => {
    onEdgesChange([{ type: 'remove', id: edgeId }])
  }, [onEdgesChange])

  const showForm = nodeData.status === 'empty' || nodeData.status === 'error' || isEditing
  const PreviewIcon = nodeKind === 'video' ? Video : ImagePlus

  return (
    <div
      className={cn(
        'w-64 rounded-xl border bg-surface shadow-sm transition-shadow',
        selected ? 'ring-2 ring-primary/60' : 'hover:shadow-md',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-primary !bg-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-primary !bg-background"
      />

      {/* 产物预览区 */}
      <div className={cn('relative overflow-hidden rounded-t-xl bg-canvas', ASPECT_CLASS[aspectRatio] ?? 'aspect-square')}>
        {nodeData.status === 'ready' && nodeData.resultUrl !== undefined ? (
          nodeData.resultKind === 'video' ? (
            <video src={nodeData.resultUrl} controls aria-label="生成的视频" className="h-full w-full object-cover" />
          ) : (
            <img src={nodeData.resultUrl} alt="生成结果" className="h-full w-full object-cover" />
          )
        ) : nodeData.status === 'generating' ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary/60" aria-hidden />
              <span className="text-xs">生成中…</span>
            </div>
          </div>
        ) : nodeData.status === 'error' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="text-xs text-destructive">{nodeData.errorMessage ?? '生成失败'}</span>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <RefreshCw className="mr-1 size-3" aria-hidden />
              重试
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:bg-accent/50"
            onClick={() => setIsEditing(true)}
          >
            <PreviewIcon className="size-8 text-muted-foreground/50" aria-hidden />
            <span className="text-xs">点击配置生成</span>
          </button>
        )}
      </div>

      {/* 配置面板 */}
      {showForm && (
        <div className="space-y-2 p-3">
          {connectedReferences.length > 0 ? (
            <div className="flex gap-1 overflow-x-auto">
              {connectedReferences.map((reference, index) => (
                <div key={reference.edgeId} className="relative size-12 shrink-0 overflow-hidden rounded-md border">
                  <img src={reference.url} alt={`参考 ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 rounded bg-background/80 p-0.5 text-foreground hover:bg-background"
                    aria-label={`移除参考 ${index + 1}`}
                    onClick={() => removeReference(reference.edgeId)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          ) : referenceUrls.length > 0 ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning-foreground">
              旧版本参考素材需要重新连接上游节点
            </div>
          ) : null}

          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            onClick={() => setIsAssetPickerOpen(open => !open)}
          >
            <ImagePlus className="mr-1 size-3" aria-hidden />
            {referenceAssetIds.length > 0 ? `管理已选素材（${referenceAssetIds.length}）` : '从资产库选择参考素材'}
          </button>
          {isAssetPickerOpen && (
            <AssetPicker
              kind={nodeKind}
              allowedKinds={selectableReferenceKinds}
              maxSelectableByKind={referenceCapacityByKind}
              selectedIds={referenceAssetIds}
              selectedKinds={referenceAssetKinds}
              onChange={(ids, kinds) => updateNodeData(id, { referenceAssetIds: ids, referenceAssetKinds: kinds })}
              onClose={() => setIsAssetPickerOpen(false)}
            />
          )}

          {referenceError !== undefined && (
            <p className="text-[10px] leading-4 text-destructive">{referenceError}</p>
          )}

          <textarea
            value={prompt}
            onChange={event => updateNodeData(id, { prompt: event.target.value })}
            placeholder="描述你想生成的内容…"
            className="min-h-[60px] w-full resize-none rounded-lg border bg-surface px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
          />

          <div className="flex items-center gap-2">
            <Select
              value={modelId}
              onValueChange={value => updateNodeData(id, { modelId: value })}
            >
              <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
                <SelectValue placeholder={`${nodeKind === 'video' ? '视频' : '图片'}模型`} />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model: ModelCatalogItem) => (
                  <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              disabled={
                prompt.trim().length === 0
                || modelId.length === 0
                || nodeData.status === 'generating'
                || referenceError !== undefined
              }
              onClick={handleGenerate}
            >
              <Send className="mr-1 size-3" aria-hidden />
              生成
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {ASPECT_RATIOS.map(ratio => (
              <button
                key={ratio}
                type="button"
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[10px] transition-colors',
                  aspectRatio === ratio
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => updateNodeData(id, { aspectRatio: ratio })}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 就绪态底部信息 */}
      {nodeData.status === 'ready' && !isEditing && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span className="truncate">{modelId}</span>
          <button type="button" className="text-primary hover:underline" onClick={() => setIsEditing(true)}>
            重新生成
          </button>
        </div>
      )}
    </div>
  )
})

MediaNode.displayName = 'MediaNode'
