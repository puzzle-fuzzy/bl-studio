import type { GenerationRecord } from '@bailian-studio/api-client'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/** 堆叠缩略图 hover 时按索引向右摊开的静态类（tailwind 需静态类名才能生成）。 */
const HOVER_SPREAD = ['group-hover:translate-x-0', 'group-hover:translate-x-1', 'group-hover:translate-x-2']

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
  const mediaArtifacts = (record.outputResult?.artifacts ?? []).filter(artifact => artifact.kind !== 'text')
  const stack = mediaArtifacts.slice(0, 3)

  return (
    <button
      type="button"
      onClick={() => onOpen(record.id)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/40',
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
        // 多产物：左侧堆叠卡片，hover 时按索引向右摊开（tailwind translate 属性与 inline transform 叠加）。
        <div className="relative h-12 w-16 shrink-0">
          {stack.map((artifact, index) => (
            <div
              key={index}
              className={cn(
                'absolute top-0 left-0 size-12 overflow-hidden rounded-md border bg-muted/30 shadow-sm transition-all duration-300',
                HOVER_SPREAD[index] ?? '',
              )}
              style={{
                transform: `translateX(${index * 5}px)`,
                zIndex: stack.length - index,
              }}
            >
              <AssetThumbnail kind={artifact.kind} url={artifact.thumbnailUrl ?? artifact.sourceUrl} />
            </div>
          ))}
          {mediaArtifacts.length > 1 && (
            <span className="absolute right-0 bottom-0 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {mediaArtifacts.length}
            </span>
          )}
        </div>
      )}
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
