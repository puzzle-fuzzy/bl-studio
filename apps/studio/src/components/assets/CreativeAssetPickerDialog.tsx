import { useEffect, useMemo, useState } from 'react'
import { Check, Image as ImageIcon, Loader2, Search } from 'lucide-react'
import type { CreativeAssetDetail, CreativeAssetSummary, CreativeAssetType } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { creativeAssetTypeLabel } from '@/lib/labels'
import { notifyError } from '@/lib/toast'

const TYPE_OPTIONS: Array<{ value: CreativeAssetType | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
]

export function CreativeAssetPickerDialog({
  open,
  onOpenChange,
  initialAssetId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialAssetId?: string
  onSelect: (assets: CreativeAssetDetail[]) => void
}) {
  const [items, setItems] = useState<CreativeAssetSummary[]>([])
  const [selected, setSelected] = useState<CreativeAssetDetail[]>([])
  const [type, setType] = useState<CreativeAssetType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAssetId, setLoadingAssetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    apiClient.listCreativeAssets({ limit: 100, ...(type === 'all' ? {} : { type }), ...(query.trim() ? { q: query.trim() } : {}) })
      .then(result => { if (!cancelled) setItems(result.items.filter(item => item.approvedVersionId !== undefined)) })
      .catch(loadError => { if (!cancelled) setError(notifyError(loadError)) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [open, query, type])

  useEffect(() => {
    if (!open || initialAssetId === undefined || selected.some(asset => asset.id === initialAssetId)) return
    let cancelled = false
    setLoadingAssetId(initialAssetId)
    apiClient.getCreativeAsset(initialAssetId)
      .then(asset => {
        if (cancelled) return
        if (asset.approvedVersionId === undefined || !asset.versions.some(version => version.id === asset.approvedVersionId && version.references.length > 0)) {
          setError(notifyError('这个资产还没有可用的已确认参考图'))
          return
        }
        setSelected(current => current.some(item => item.id === asset.id) ? current : [...current, asset])
      })
      .catch(loadError => { if (!cancelled) setError(notifyError(loadError)) })
      .finally(() => { if (!cancelled) setLoadingAssetId(null) })
    return () => { cancelled = true }
  }, [initialAssetId, open, selected])

  const filteredItems = useMemo(() => items.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, query])

  async function toggle(item: CreativeAssetSummary) {
    const existing = selected.find(asset => asset.id === item.id)
    if (existing !== undefined) {
      setSelected(current => current.filter(asset => asset.id !== item.id))
      return
    }
    setLoadingAssetId(item.id)
    setError(null)
    try {
      const detail = await apiClient.getCreativeAsset(item.id)
      const approved = detail.versions.find(version => version.id === detail.approvedVersionId)
      if (approved === undefined || approved.references.length === 0) {
        setError(notifyError('这个资产的已确认版本没有可用参考图'))
        return
      }
      setSelected(current => [...current, detail])
    } catch (loadError) {
      setError(notifyError(loadError))
    } finally {
      setLoadingAssetId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(780px,calc(100svh-2rem))] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>引用已确认创意资产</DialogTitle>
          <DialogDescription>选择主体、场景或道具。生成时会带入已确认版本和具体参考图，后续资产更新不会改写这次引用。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索已确认素材" className="pl-9" /></div>
            <Select value={type} onValueChange={value => setType(value as CreativeAssetType | 'all')}><SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger><SelectContent>{TYPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
          </div>
          {selected.length > 0 && <div className="flex flex-wrap gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3"><span className="mr-1 self-center text-xs text-muted-foreground">本次引用</span>{selected.map(asset => <button key={asset.id} type="button" onClick={() => setSelected(current => current.filter(item => item.id !== asset.id))} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-1 text-xs text-primary">{asset.name}<span aria-hidden="true">×</span></button>)}</div>}
          {isLoading ? <div className="flex h-72 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />正在读取已确认素材</div> : error !== null ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center"><ImageIcon className="size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">暂时无法读取素材列表</p><Button size="sm" variant="outline" onClick={() => setError(null)}>继续选择</Button></div> : filteredItems.length === 0 ? <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"><ImageIcon className="size-8" /><p>还没有可引用的已确认素材</p><p className="text-xs">请先在素材详情页完成版本确认。</p></div> : <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">{filteredItems.map(item => { const isSelected = selected.some(asset => asset.id === item.id); const isBusy = loadingAssetId === item.id; const previewUrl = item.preview?.thumbnailUrl ?? item.preview?.url; return <button key={item.id} type="button" onClick={() => void toggle(item)} disabled={isBusy || loadingAssetId !== null} aria-pressed={isSelected} className={`group relative overflow-hidden rounded-lg border text-left transition-[border-color,transform] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}><div className="aspect-[4/3] bg-muted">{previewUrl ? <img src={resolveApiUrl(previewUrl)} alt={`${item.name}预览`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><ImageIcon className="size-7 text-muted-foreground" /></div>}</div><div className="p-2.5"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{creativeAssetTypeLabel(item.type)} · v{item.latestVersion?.version ?? '—'}</p></div>{isSelected && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}{isBusy && <span className="absolute inset-0 flex items-center justify-center bg-background/70"><Loader2 className="size-5 animate-spin text-primary" /></span>}</button> })}</div>}
          <p className="text-xs text-muted-foreground">每个素材会按其类型自动占用稳定槽位；已确认版本中的参考图全部随版本进入本次生成快照。</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={() => { onSelect(selected); onOpenChange(false) }} disabled={selected.length === 0 || loadingAssetId !== null}>使用所选素材（{selected.length}）</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
