import type { AssetItem } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@bailian-studio/lib-client'
import { ImagePlus, Loader2, Search, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MediaKind } from './MediaNode'

interface AssetPickerProps {
  kind: MediaKind
  allowedKinds: readonly MediaKind[]
  maxSelectableByKind: Readonly<Partial<Record<MediaKind, number>>>
  selectedIds: readonly string[]
  selectedKinds: Readonly<Record<string, MediaKind>>
  onChange: (ids: string[], kinds: Record<string, MediaKind>) => void
  onClose: () => void
}

/** 画布节点的素材选择器：写入稳定资产 ID 与媒体类型，URL 仅用于当前预览。 */
export function AssetPicker({
  kind,
  allowedKinds,
  maxSelectableByKind,
  selectedIds,
  selectedKinds,
  onChange,
  onClose,
}: AssetPickerProps) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const mediaKinds = useMemo(
    () => [...new Set(allowedKinds.length > 0 ? allowedKinds : [kind])],
    [allowedKinds, kind],
  )

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(undefined)
    void Promise.all(mediaKinds.map(mediaKind => apiClient.listAssets({ kind: mediaKind, limit: 50, sort: 'time' })))
      .then(results => {
        if (disposed) return
        const byId = new Map<string, AssetItem>()
        for (const result of results) {
          for (const asset of result.items) byId.set(asset.id, asset)
        }
        setAssets([...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)))
      })
      .catch(() => {
        if (!disposed) setError('素材库加载失败')
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => { disposed = true }
  }, [mediaKinds])

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (normalized.length === 0) return assets
    return assets.filter(asset => (asset.fileName ?? asset.id).toLocaleLowerCase().includes(normalized))
  }, [assets, query])

  const selectedCountByKind = useMemo(() => {
    const counts: Partial<Record<MediaKind, number>> = {}
    for (const selectedId of selectedIds) {
      const selectedKind = selectedKinds[selectedId] ?? kind
      if (selectedKind !== 'image' && selectedKind !== 'video') continue
      counts[selectedKind] = (counts[selectedKind] ?? 0) + 1
    }
    return counts
  }, [selectedIds, selectedKinds])

  const capacitySummary = mediaKinds
    .map(mediaKind => `${mediaKind === 'image' ? '图片' : '视频'} ${selectedCountByKind[mediaKind] ?? 0}/${maxSelectableByKind[mediaKind] ?? 0}`)
    .join(' · ')

  const toggle = (asset: AssetItem) => {
    if (asset.kind !== 'image' && asset.kind !== 'video') return
    const id = asset.id
    const selected = selectedIds.includes(id)
    const capacity = maxSelectableByKind[asset.kind]
    const selectedCount = selectedCountByKind[asset.kind] ?? 0
    if (!selected && capacity !== undefined && selectedCount >= capacity) return
    const next = selected
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id]
    const nextKinds = { ...selectedKinds }
    if (selected) delete nextKinds[id]
    else nextKinds[id] = asset.kind
    onChange(next, nextKinds)
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
      <p className="text-[10px] text-muted-foreground">参考槽位：{capacitySummary}</p>
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
          const assetKind = asset.kind === 'image' || asset.kind === 'video' ? asset.kind : undefined
          const capacity = assetKind === undefined ? 0 : maxSelectableByKind[assetKind]
          const atCapacity = assetKind === undefined
            || (!selected && capacity !== undefined && (selectedCountByKind[assetKind] ?? 0) >= capacity)
          return (
            <button
              key={asset.id}
              type="button"
              title={asset.fileName ?? asset.id}
              aria-pressed={selected}
              disabled={atCapacity}
              className={`relative aspect-square overflow-hidden rounded-md border bg-muted transition ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/60'} disabled:cursor-not-allowed disabled:opacity-45`}
              onClick={() => toggle(asset)}
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
