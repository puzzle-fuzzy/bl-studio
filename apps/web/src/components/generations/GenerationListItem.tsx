import { useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { GenerationRecord } from '@bailian-studio/api-client'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { PromptSegments } from '@/components/generations/PromptSegments'
import { formatCents } from '@/lib/money'
import { parsePromptReferences } from '@/lib/reference-format'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { useReferenceAssetsStore } from '@/stores/reference-assets-store'
import { cn } from '@/lib/utils'

/** 一条生成任务：结果缩略图（多产物扇形堆叠）+ 状态 + 模型 + 费用 + 参考图 + 提示词 + 复制。 */
export function GenerationListItem({
  record,
  onOpen,
  className,
}: {
  record: GenerationRecord
  onOpen: (id: string) => void
  className?: string
}) {
  const mediaArtifacts = (record.outputResult?.artifacts ?? []).filter(artifact => artifact.kind !== 'text')
  const stack = mediaArtifacts.slice(0, 3)
  const prompt = typeof record.inputParams?.prompt === 'string' ? record.inputParams.prompt : ''
  const assetRefs = record.assetRefs ?? {}
  const [copied, setCopied] = useState(false)

  const models = useModelCatalogStore(state => state.models)
  const refAssets = useReferenceAssetsStore(state => state.assets)
  const getRefAssets = useReferenceAssetsStore(state => state.getAssets)

  // 模型已知时用其 referenceFormat 解析标记；未知（历史记录不在目录）走无歧义回退解析。
  const format = useMemo(() => {
    const model = selectModelById(models, record.modelId)
    return model?.referenceFormat
  }, [models, record.modelId])

  // assetRefs → 扁平化的参考条目（按参数名 + 位置），供上方参考图行与内联标记取图。
  const refEntries = useMemo(() => {
    const entries: Array<{ id: string; parameterName: string; position: number }> = []
    for (const [parameterName, ids] of Object.entries(assetRefs)) {
      ids.forEach((id, position) => entries.push({ id, parameterName, position }))
    }
    return entries
  }, [assetRefs])

  const refIds = useMemo(() => refEntries.map(entry => entry.id), [refEntries])

  useEffect(() => {
    if (refIds.length === 0) return
    void getRefAssets(refIds)
  }, [getRefAssets, refIds])

  // 提示词拆成「文本 + 参考图」段：标记序号 N 对应 references 池下标 N-1。
  const segments = useMemo(() => parsePromptReferences(prompt, format), [prompt, format])
  const referencedIndexes = useMemo(
    () => new Set(segments.flatMap(segment => (segment.type === 'image' ? [segment.index ?? -1] : []))),
    [segments],
  )
  const referencesPool = assetRefs.references ?? []

  // 单独传输的参考图（不在提示词标记内）：非 references 参数的媒体，或 references
  // 池中未被标记引用的条目。放在提示词上方单独展示。
  const separateRefs = useMemo(
    () =>
      refEntries.filter(entry => {
        if (entry.parameterName !== 'references') return true
        return !referencedIndexes.has(entry.position + 1)
      }),
    [refEntries, referencedIndexes],
  )

  const assetImg = (entry: { id: string }): string | undefined => {
    const asset = refAssets[entry.id]
    if (asset === undefined) return undefined
    return asset.thumbnailUrl ?? asset.url ?? undefined
  }

  const handleCopyPrompt = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (prompt === '') return
    void navigator.clipboard?.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(record.id)}
      className={cn(
        'group flex w-full items-center gap-3 p-2 text-left transition-colors hover:bg-muted/40',
        className,
      )}
    >
      {stack.length <= 1 ? (
        <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted/30">
          {stack[0] !== undefined ? (
            <AssetThumbnail kind={stack[0].kind} url={stack[0].thumbnailUrl ?? stack[0].sourceUrl} />
          ) : (
            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {record.status}
            </span>
          )}
        </div>
      ) : (
        // 多产物：底部对齐的扇形缩略图；hover 时 --fan 放大 → 扇形微微展开。
        <div className="relative h-12 w-16 shrink-0">
          {stack.map((artifact, index) => (
            <div
              key={index}
              className="absolute bottom-0 left-1/2 size-11 origin-bottom overflow-hidden rounded-md border bg-muted/30 shadow-sm transition-transform duration-300 group-hover:[--fan:1.6]"
              style={{
                transform: `translateX(-50%) rotate(calc(${(index - (stack.length - 1) / 2) * 12}deg * var(--fan, 1)))`,
                zIndex: index,
              }}
            >
              <AssetThumbnail kind={artifact.kind} url={artifact.thumbnailUrl ?? artifact.sourceUrl} />
            </div>
          ))}
          {mediaArtifacts.length > 1 && (
            <span className="absolute top-0 right-0 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {mediaArtifacts.length}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <StatusBadge status={record.status} className="shrink-0" />
          <span className="truncate text-sm font-medium">{record.modelId}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatCents(record.costEstimate)}</span>
        </div>

        {separateRefs.length > 0 && (
          <div className="flex items-center gap-1">
            {separateRefs.slice(0, 3).map(entry => {
              const imgSrc = assetImg(entry)
              const asset = refAssets[entry.id]
              if (imgSrc === undefined) return null
              return (
                <div
                  key={entry.id}
                  title={asset?.fileName ?? asset?.kind}
                  className="size-6 shrink-0 overflow-hidden rounded border bg-muted/30"
                >
                  <AssetThumbnail kind={asset?.kind ?? 'image'} url={imgSrc} />
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {prompt !== '' ? (
              <PromptSegments prompt={prompt} format={format} pool={referencesPool} refAssets={refAssets} />
            ) : (
              '(无提示词)'
            )}
          </span>
          {prompt !== '' && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="复制提示词"
              title="复制提示词"
              onClick={handleCopyPrompt}
              className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground/70">{relativeTime(record.createdAt)}</div>
      </div>
    </button>
  )
}

/** 相对时间（简化版，无第三方依赖）。 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}
