import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Grid } from 'react-window'
import { Download, Loader2, X } from 'lucide-react'
import type { AssetItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
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

      <div ref={ref} className="h-[calc(100vh-16rem)] min-h-64 overflow-hidden">
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
  const url = src !== undefined ? resolveApiUrl(src) : undefined

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    // 全屏查看：黑色遮罩，点击遮罩或 Esc 关闭；底部带下载按钮。
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6"
      onClick={onClose}
    >
      <div className="mb-3 flex max-w-full items-center gap-2 text-sm text-white/90">
        <span className="max-w-64 truncate">{asset.fileName ?? `${kindLabel(asset.kind)}素材`}</span>
        <span className="shrink-0 text-white/60">
          {kindLabel(asset.kind)} · {sourceLabel(asset.source)}
        </span>
      </div>

      <div
        className="flex max-h-[65vh] max-w-full items-center justify-center"
        onClick={event => event.stopPropagation()}
      >
        {asset.kind === 'image' && url !== undefined && !imgFailed && (
          <img
            src={url}
            alt=""
            className="max-h-[65vh] max-w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        )}
        {asset.kind === 'video' && url !== undefined && (
          <video src={url} controls autoPlay className="max-h-[65vh] max-w-full" />
        )}
        {asset.kind === 'audio' && url !== undefined && (
          <audio src={url} controls autoPlay className="w-full max-w-lg" />
        )}
        {asset.kind === 'text' && (
          <p className="max-h-[65vh] max-w-2xl overflow-y-auto whitespace-pre-wrap text-sm text-white/90">
            {asset.text ?? (url !== undefined ? <TextFetchFallback url={url} /> : '(空文本)')}
          </p>
        )}
        {imgFailed && (
          <button type="button" className="text-sm text-white/90 underline" onClick={onRefresh}>
            图片加载失败，点击刷新
          </button>
        )}
      </div>

      {url !== undefined && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download
          onClick={event => event.stopPropagation()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/20"
        >
          <Download className="size-4" />
          下载
        </a>
      )}

      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
    </div>
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
