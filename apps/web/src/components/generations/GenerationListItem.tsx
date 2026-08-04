import type { GenerationRecord } from '@bailian-studio/api-client'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/** 生成任务卡片：首产物缩略图 + 状态 + 模型 + 费用 + 时间。 */
export function GenerationListItem({
  record,
  onOpen,
  className,
}: {
  record: GenerationRecord
  onOpen: (id: string) => void
  className?: string
}) {
  const artifact = record.outputResult?.artifacts?.[0]
  const thumbnailSrc = artifact?.thumbnailUrl ?? artifact?.sourceUrl

  return (
    <button
      type="button"
      onClick={() => onOpen(record.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/40',
        className,
      )}
    >
      <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted/30">
        {artifact !== undefined && artifact.kind !== 'text' && thumbnailSrc !== undefined ? (
          <AssetThumbnail kind={artifact.kind} url={thumbnailSrc} />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
            {record.status}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <StatusBadge status={record.status} className="shrink-0" />
          <span className="truncate text-sm font-medium">{record.modelId}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatCents(record.costEstimate)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{relativeTime(record.createdAt)}</span>
        </div>
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
