import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Grid } from 'react-window'
import { Loader2 } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { MediaLightbox, isLightboxKind } from '@/components/shared/MediaLightbox'
import { assetQueryKey, useAssetsStore, type AssetQuery } from '@/stores/assets-store'
import { usePendingThumbnailRefresh, hasPendingThumbnails } from '@/hooks/use-thumbnail-refresh'
import { kindLabel, sourceLabel } from '@/lib/labels'
import { resolveApiUrl } from '@/lib/api'
import { useContainerSize } from '@/components/generations/GenerationsPanel'

const KINDS = ['image', 'video', 'audio', 'text', 'archive'] as const
const SOURCES = ['upload', 'link', 'generation', 'derived'] as const

/** 作品库：统一资产网格（虚拟滚动）+ kind/source 筛选 + 预览。 */
export function LibraryPage() {
  const [kind, setKind] = useState<string>('all')
  const [source, setSource] = useState<string>('all')
  const [layout, setLayout] = useState<'grid' | 'timeline'>('grid')
  const query: AssetQuery = useMemo(() => {
    const q: AssetQuery = {}
    if (kind !== 'all') q.kind = kind
    if (source !== 'all') q.source = source
    return q
  }, [kind, source])

  const queryKey = assetQueryKey(query)
  const state = useAssetsStore(store => store.queries[queryKey])
  const load = useAssetsStore(store => store.load)
  const loadMore = useAssetsStore(store => store.loadMore)

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const { ref, size } = useContainerSize<HTMLDivElement>()

  useEffect(() => {
    void load(query)
  }, [load, queryKey])

  const items = state?.items ?? []
  const pendingThumbnails = hasPendingThumbnails(items)
  usePendingThumbnailRefresh(pendingThumbnails, () => void load(query, true))

  const columns = columnsForWidth(size.width)
  const columnWidth = size.width / columns
  const rowHeight = columnWidth + 28
  const rowCount = Math.ceil(items.length / columns)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">资产</h1>
        <Select value={layout} onValueChange={value => setLayout(value as 'grid' | 'timeline')}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grid">网格布局</SelectItem>
            <SelectItem value="timeline">时间线</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {KINDS.map(k => (
              <SelectItem key={k} value={k}>
                {kindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            {SOURCES.map(s => (
              <SelectItem key={s} value={s}>
                {sourceLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pendingThumbnails && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            缩略图生成中…
          </span>
        )}
      </div>

      {layout === 'grid' ? (
        <div ref={ref} className="h-[calc(100vh-16rem)] min-h-64 overflow-hidden">
          {size.width > 0 && items.length > 0 && (
            <Grid<AssetCellProps>
              columnCount={columns}
              columnWidth={columnWidth}
              rowCount={rowCount}
              rowHeight={rowHeight}
              cellComponent={AssetCell}
              cellProps={{ items, columns, onPreview: setPreviewIndex }}
              overscanCount={4}
              className="h-full"
            />
          )}
          {items.length === 0 && (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {state?.isLoading ? '加载中…' : '还没有作品，去创作吧'}
            </p>
          )}
        </div>
      ) : (
        <div className="h-[calc(100vh-16rem)] min-h-64 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {state?.isLoading ? '加载中…' : '还没有作品，去创作吧'}
            </p>
          ) : (
            <TimelineView items={items} onPreview={setPreviewIndex} />
          )}
        </div>
      )}

      {state?.nextCursor !== undefined && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore(query)}>
            加载更多
          </Button>
        </div>
      )}

      {previewIndex !== null && items[previewIndex] !== undefined && (
        <MediaLightbox
          items={items.map(asset => ({
            key: asset.id,
            kind: isLightboxKind(asset.kind) ? asset.kind : 'image',
            url: asset.url ?? asset.downloadUrl,
            thumbnailUrl: asset.thumbnailUrl,
            fileName: asset.fileName ?? `${kindLabel(asset.kind)}素材`,
            text: asset.text,
          }))}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          downloadUrl={
            (items[previewIndex]?.url ?? items[previewIndex]?.downloadUrl) !== undefined
              ? resolveApiUrl(items[previewIndex].url ?? items[previewIndex].downloadUrl ?? '')
              : undefined
          }
        />
      )}
    </div>
  )
}

interface AssetCellProps {
  items: readonly AssetItem[]
  columns: number
  onPreview: (index: number) => void
}

function AssetCell({
  columnIndex,
  rowIndex,
  style,
  items,
  columns,
  onPreview,
}: {
  columnIndex: number
  rowIndex: number
  style: CSSProperties
} & AssetCellProps) {
  const index = rowIndex * columns + columnIndex
  const item = items[index]
  if (item === undefined) return null
  return (
    <div style={style} className="p-1.5">
      <button
        type="button"
        onClick={() => onPreview(index)}
        className="group relative block aspect-square w-full overflow-hidden rounded-lg border hover:border-primary/50"
      >
        <AssetThumbnail kind={item.kind} url={item.url} thumbnailUrl={item.thumbnailUrl} />
        <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground">
          {kindLabel(item.kind)} · {sourceLabel(item.source)}
        </span>
      </button>
    </div>
  )
}

/** 按容器宽度计算网格列数（4→1 列响应式）。 */
export function columnsForWidth(width: number): number {
  if (width <= 0) return 4
  if (width < 480) return 2
  if (width < 720) return 3
  if (width < 1024) return 4
  return 5
}

/** 时间线分桶：今天 / 近三天 / 本周 / 本月 / 以往（按 createdAt）。 */
function timelineBuckets(items: readonly AssetItem[]): Array<{ label: string; items: AssetItem[] }> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThreeDays = new Date(startOfDay.getTime() - 2 * 86_400_000)
  // 本周从周一开始。
  const startOfWeek = new Date(startOfDay.getTime() - ((now.getDay() + 6) % 7) * 86_400_000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const buckets: { today: AssetItem[]; days3: AssetItem[]; week: AssetItem[]; month: AssetItem[]; older: AssetItem[] } = {
    today: [],
    days3: [],
    week: [],
    month: [],
    older: [],
  }
  for (const item of items) {
    const created = new Date(item.createdAt)
    if (Number.isNaN(created.getTime())) {
      buckets.older.push(item)
      continue
    }
    if (created >= startOfDay) buckets.today.push(item)
    else if (created >= startOfThreeDays) buckets.days3.push(item)
    else if (created >= startOfWeek) buckets.week.push(item)
    else if (created >= startOfMonth) buckets.month.push(item)
    else buckets.older.push(item)
  }
  const order: Array<[keyof typeof buckets, string]> = [
    ['today', '今天'],
    ['days3', '近三天'],
    ['week', '本周'],
    ['month', '本月'],
    ['older', '以往'],
  ]
  return order
    .flatMap(([key, label]) => (buckets[key].length > 0 ? [{ label, items: buckets[key] }] : []))
}

/** 时间线视图：按 今天/近三天/本周/本月/以往 分组，组间分割线；item 保持方形与网格一致。 */
function TimelineView({
  items,
  onPreview,
}: {
  items: readonly AssetItem[]
  onPreview: (index: number) => void
}) {
  const buckets = timelineBuckets(items)
  return (
    <div className="space-y-6">
      {buckets.map(bucket => (
        <div key={bucket.label}>
          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 text-sm font-medium">{bucket.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{bucket.items.length} 个</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-wrap gap-2">
            {bucket.items.map(item => {
              const index = items.findIndex(candidate => candidate.id === item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPreview(index)}
                  className="group relative block aspect-square w-24 overflow-hidden rounded-lg border hover:border-primary/50"
                >
                  <AssetThumbnail kind={item.kind} url={item.url} thumbnailUrl={item.thumbnailUrl} />
                  <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[10px] text-foreground">
                    {kindLabel(item.kind)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

