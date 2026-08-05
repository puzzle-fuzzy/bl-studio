import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { GenerationRecord } from '@bailian-studio/api-client'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * 生成任务行：缩略图（多产物扇形堆叠）+ 状态 + 模型 + 费用 + 提示词 + 复制。
 * 无卡片边框（列表用分割线划分，见 GenerationsPanel）。
 */
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
  const [copied, setCopied] = useState(false)

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
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{prompt !== '' ? prompt : '(无提示词)'}</span>
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
