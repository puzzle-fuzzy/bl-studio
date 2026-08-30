import type { AssetItem } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@bailian-studio/lib-client'
import { ImagePlus, Loader2, Search, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MediaKind } from './MediaNode'

interface AssetPickerProps {
  kind: MediaKind
  selectedIds: readonly string[]
  onChange: (ids: string[]) => void
  onClose: () => void
}

/** 画布节点的素材选择器：只写入资产 ID，URL 仅用于当前预览。 */
export function AssetPicker({ kind, selectedIds, onChange, onClose }: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(undefined)
    void apiClient.listAssets({ kind, limit: 50, sort: 'time' })
      .then(result => {
        if (!disposed) setAssets(result.items)
      })
      .catch(() => {
        if (!disposed) setError('素材库加载失败')
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => { disposed = true }
  }, [kind])

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (normalized.length === 0) return assets
    return assets.filter(asset => (asset.fileName ?? asset.id).toLocaleLowerCase().includes(normalized))
  }, [assets, query])

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  return (
    <div
      className="space-y-2 rounded-lg border bg-background p-2 shadow-sm"
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium">从资产库选择{selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}</span>
        <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onClose}>完成</button>
      </div>
      <label className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-muted-foreground">
        <Search className="size-3" aria-hidden />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="搜索文件名"
          className="min-w-0 flex-1 bg-transparent text-[10px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </label>
      {loading && <div className="flex justify-center py-3"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>}
      {error !== undefined && <p className="py-2 text-center text-[10px] text-destructive">{error}</p>}
      {!loading && error === undefined && filteredAssets.length === 0 && (
        <p className="py-2 text-center text-[10px] text-muted-foreground">暂无可用素材</p>
      )}
      <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
        {filteredAssets.map(asset => {
          const previewUrl = resolveApiUrl(asset.thumbnailUrl ?? asset.url ?? asset.downloadUrl)
          const selected = selectedIds.includes(asset.id)
          return (
            <button
              key={asset.id}
              type="button"
              title={asset.fileName ?? asset.id}
              aria-pressed={selected}
              className={`relative aspect-square overflow-hidden rounded-md border bg-muted transition ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/60'}`}
              onClick={() => toggle(asset.id)}
            >
              {previewUrl !== '' && asset.kind === 'image' ? (
                <img src={previewUrl} alt={asset.fileName ?? '图片素材'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  {asset.kind === 'video' ? <Video className="size-4" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                </div>
              )}
              {selected && <span className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[9px] text-primary-foreground">已选</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
