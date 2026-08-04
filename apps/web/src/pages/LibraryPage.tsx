import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Grid } from 'react-window'
import { Download, Loader2 } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { assetQueryKey, useAssetsStore, type AssetQuery } from '@/stores/assets-store'
import { usePendingThumbnailRefresh, hasPendingThumbnails } from '@/hooks/use-thumbnail-refresh'
import { kindLabel, sourceLabel } from '@/lib/labels'
import { resolveApiUrl } from '@/lib/api'
import { useContainerSize } from '@/components/generations/GenerationsPanel'
import { cn } from '@/lib/utils'

const KINDS = ['image', 'video', 'audio', 'text', 'archive'] as const
const SOURCES = ['upload', 'link', 'generation', 'derived'] as const

/** 作品库：统一资产网格（虚拟滚动）+ kind/source 筛选 + 预览。 */
export function LibraryPage() {
  const [kind, setKind] = useState<string>('all')
  const [source, setSource] = useState<string>('all')
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
  const getFreshAsset = useAssetsStore(store => store.getFreshAsset)

  const [preview, setPreview] = useState<AssetItem | null>(null)
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
        <h1 className="mr-auto text-2xl font-semibold">作品库</h1>
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

      <div ref={ref} className="h-[calc(100vh-16rem)] min-h-64 overflow-hidden rounded-lg border">
        {size.width > 0 && items.length > 0 && (
          <Grid<AssetCellProps>
            columnCount={columns}
            columnWidth={columnWidth}
            rowCount={rowCount}
            rowHeight={rowHeight}
            cellComponent={AssetCell}
            cellProps={{ items, columns, onPreview: setPreview }}
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

      {state?.nextCursor !== undefined && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore(query)}>
            加载更多
          </Button>
        </div>
      )}

      {preview !== null && (
        <AssetPreviewDialog
          asset={preview}
          onClose={() => setPreview(null)}
          onRefresh={() => void getFreshAsset(preview.id)}
        />
      )}
    </div>
  )
}

interface AssetCellProps {
  items: readonly AssetItem[]
  columns: number
  onPreview: (asset: AssetItem) => void
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
        onClick={() => onPreview(item)}
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

function AssetPreviewDialog({
  asset,
  onClose,
  onRefresh,
}: {
  asset: AssetItem
  onClose: () => void
  onRefresh: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = asset.url ?? asset.downloadUrl
  const isMedia = asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio'

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{asset.fileName ?? `${kindLabel(asset.kind)}素材`}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {kindLabel(asset.kind)} · {sourceLabel(asset.source)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className={cn('space-y-3', isMedia && 'space-y-4')}>
          {asset.kind === 'image' && src !== undefined && !imgFailed && (
            <img
              src={resolveApiUrl(src)}
              alt=""
              className="mx-auto max-h-96 rounded-lg object-contain"
              onError={() => setImgFailed(true)}
            />
          )}
          {asset.kind === 'video' && src !== undefined && (
            <video src={resolveApiUrl(src)} controls className="mx-auto max-h-96 rounded-lg" />
          )}
          {asset.kind === 'audio' && src !== undefined && (
            <audio src={resolveApiUrl(src)} controls className="w-full" />
          )}
          {asset.kind === 'text' && (
            <p className="max-h-96 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm">
              {asset.text ?? (src !== undefined ? <TextFetchFallback url={src} /> : '(空文本)')}
            </p>
          )}
          {imgFailed && (
            <button type="button" className="text-sm text-primary hover:underline" onClick={onRefresh}>
              图片加载失败，点击刷新
            </button>
          )}
        </div>
        {src !== undefined && (
          <Button className="w-full" asChild>
            <a href={resolveApiUrl(src)} target="_blank" rel="noreferrer">
              <Download data-icon />
              打开 / 下载
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TextFetchFallback({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(resolveApiUrl(url))
      .then(response => (response.ok ? response.text() : ''))
      .then(body => {
        if (!cancelled) setText(body)
      })
      .catch(() => {
        if (!cancelled) setText('(无法读取文本内容)')
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return <>{text ?? '加载中…'}</>
}
