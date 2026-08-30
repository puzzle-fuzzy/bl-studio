import type { AssetItem } from '@bailian-studio/api-client'
import { apiClient, resolveApiUrl } from '@bailian-studio/lib-client'
import { ImagePlus, Loader2, Search, Video } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaKind } from '@/lib/media-node-data'

interface AssetPickerProps {
  kind: MediaKind
  allowedKinds: readonly MediaKind[]
  maxSelectableByKind: Readonly<Partial<Record<MediaKind, number>>>
  selectedIds: readonly string[]
  selectedKinds: Readonly<Record<string, MediaKind>>
  onChange: (ids: string[], kinds: Record<string, MediaKind>) => void
  onClose: () => void
}

const ASSET_PAGE_SIZE = 50

function sortAssets(assets: readonly AssetItem[]): AssetItem[] {
  return [...assets].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function mergeAssets(current: readonly AssetItem[], additions: readonly AssetItem[]): AssetItem[] {
  const byId = new Map(current.map(asset => [asset.id, asset]))
  for (const asset of additions) byId.set(asset.id, asset)
  return sortAssets([...byId.values()])
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
  const [activeQuery, setActiveQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [nextCursors, setNextCursors] = useState<Partial<Record<MediaKind, string>>>({})
  const requestKeyRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const mediaKinds = useMemo(
    () => [...new Set(allowedKinds.length > 0 ? allowedKinds : [kind])],
    [allowedKinds, kind],
  )

  // 搜索走服务端，避免只在当前已加载的 50 条素材中查找；延迟一点请求，
  // 防止用户连续输入时每个字符都重置分页。
  useEffect(() => {
    const timer = setTimeout(() => setActiveQuery(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let disposed = false
    const requestKey = requestKeyRef.current + 1
    requestKeyRef.current = requestKey
    loadingMoreRef.current = false
    setLoading(true)
    setLoadingMore(false)
    setError(undefined)
    setAssets([])
    setNextCursors({})
    void Promise.all(mediaKinds.map(async mediaKind => ({
      kind: mediaKind,
      result: await apiClient.listAssets({
        kind: mediaKind,
        limit: ASSET_PAGE_SIZE,
        sort: 'time',
        ...(activeQuery.length > 0 ? { q: activeQuery } : {}),
      }),
    })))
      .then(results => {
        if (disposed || requestKeyRef.current !== requestKey) return
        setAssets(mergeAssets([], results.flatMap(result => result.result.items)))
        setNextCursors(Object.fromEntries(
          results.flatMap(result => result.result.nextCursor === undefined
            ? []
            : [[result.kind, result.result.nextCursor] as const]),
        ))
      })
      .catch(() => {
        if (!disposed && requestKeyRef.current === requestKey) setError('素材库加载失败')
      })
      .finally(() => {
        if (!disposed && requestKeyRef.current === requestKey) setLoading(false)
      })
    return () => { disposed = true }
  }, [activeQuery, mediaKinds])

  const hasMore = Object.keys(nextCursors).length > 0

  const loadMore = async () => {
    if (loadingMoreRef.current || !hasMore) return
    const requestKey = requestKeyRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setError(undefined)
    try {
      const results = await Promise.all(
        mediaKinds.flatMap(mediaKind => {
          const cursor = nextCursors[mediaKind]
          if (cursor === undefined) return []
          return [apiClient.listAssets({
            kind: mediaKind,
            cursor,
            limit: ASSET_PAGE_SIZE,
            sort: 'time',
            ...(activeQuery.length > 0 ? { q: activeQuery } : {}),
          }).then(result => ({ kind: mediaKind, result }))]
        }),
      )
      if (requestKeyRef.current !== requestKey) return
      setAssets(current => mergeAssets(current, results.flatMap(result => result.result.items)))
      setNextCursors(current => {
        const next = { ...current }
        for (const result of results) {
          if (result.result.nextCursor === undefined) delete next[result.kind]
          else next[result.kind] = result.result.nextCursor
        }
        return next
      })
    }
    catch {
      if (requestKeyRef.current === requestKey) setError('更多素材加载失败，请重试')
    }
    finally {
      if (requestKeyRef.current === requestKey) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  // 模型切换后，历史快照中的素材可能不再属于当前允许类型；仍按 ID 读取它们，
  // 让用户可以在选择器中移除无效绑定，而不是被不可见的旧状态卡住。
  useEffect(() => {
    const knownIds = new Set(assets.map(asset => asset.id))
    const missingIds = selectedIds.filter(assetId => !knownIds.has(assetId))
    if (missingIds.length === 0) return

    let disposed = false
    void Promise.all(missingIds.map(async assetId => {
      try {
        return await apiClient.getAsset(assetId)
      }
      catch {
        return undefined
      }
    })).then(results => {
      if (disposed) return
      const additions = results.filter((asset): asset is AssetItem => asset !== undefined)
      if (additions.length === 0) return
      setAssets(current => {
        const byId = new Map(current.map(asset => [asset.id, asset]))
        for (const asset of additions) byId.set(asset.id, asset)
        return sortAssets([...byId.values()])
      })
    })

    return () => { disposed = true }
  }, [assets, selectedIds])

  const displayAssets = useMemo(() => {
    const byId = new Map(assets.map(asset => [asset.id, asset]))
    for (const selectedId of selectedIds) {
      if (byId.has(selectedId)) continue
      byId.set(selectedId, {
        id: selectedId,
        kind: selectedKinds[selectedId] ?? kind,
        source: 'derived',
        fileName: '已选参考素材（详情不可用）',
        createdAt: '',
      })
    }
    return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [assets, kind, selectedIds, selectedKinds])

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (normalized.length === 0) return displayAssets
    return displayAssets.filter(asset => (asset.fileName ?? asset.id).toLocaleLowerCase().includes(normalized))
  }, [displayAssets, query])

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
    .concat(
      [...new Set(Object.values(selectedKinds))].filter(mediaKind => !mediaKinds.includes(mediaKind)),
    )
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
      {!loading && hasMore && (
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-md border py-1 text-[10px] text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? '加载中…' : '加载更多素材'}
        </button>
      )}
    </div>
  )
}
