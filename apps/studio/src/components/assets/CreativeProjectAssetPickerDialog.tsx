import { useEffect, useState } from 'react'
import { Check, FolderPlus, Image as ImageIcon, Loader2, Search } from 'lucide-react'
import type { CreativeAssetSummary, CreativeAssetType } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bailian-studio/ui'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { creativeAssetTypeLabel, creativeAssetVersionStatusLabel } from '@/lib/labels'
import { notifyError } from '@/lib/toast'

const TYPE_OPTIONS: Array<{ value: CreativeAssetType | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
]

export function CreativeProjectAssetPickerDialog({
  open,
  onOpenChange,
  excludedAssetIds,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludedAssetIds: ReadonlySet<string>
  onConfirm: (assets: CreativeAssetSummary[]) => void
}) {
  const [items, setItems] = useState<CreativeAssetSummary[]>([])
  const [selectedAssets, setSelectedAssets] = useState<CreativeAssetSummary[]>([])
  const [type, setType] = useState<CreativeAssetType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open) return
    setSelectedAssets([])
    setQuery('')
    setType('all')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    apiClient.listCreativeAssets({
      limit: 100,
      ...(type === 'all' ? {} : { type }),
      ...(query.trim() ? { q: query.trim() } : {}),
    })
      .then(result => {
        if (cancelled) return
        setItems(result.items.filter(item => !excludedAssetIds.has(item.id)))
      })
      .catch(loadError => {
        if (!cancelled) {
          notifyError(loadError)
          setError('load')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [excludedAssetIds, open, query, reloadToken, type])

  function toggle(asset: CreativeAssetSummary) {
    setSelectedAssets(current => current.some(item => item.id === asset.id)
      ? current.filter(item => item.id !== asset.id)
      : [...current, asset])
  }

  function handleConfirm() {
    onConfirm(selectedAssets)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(820px,calc(100svh-2rem))] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>添加已有素材</DialogTitle>
          <DialogDescription>
            从素材库挑选要放进当前项目的主体、场景或道具。素材本身不会被复制，后续仍可在其他项目中复用。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="project-asset-picker-search" className="sr-only">搜索可添加素材</label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="project-asset-picker-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索素材名称或描述"
                className="pl-9"
                title="搜索可添加素材"
              />
            </div>
            <Select value={type} onValueChange={value => setType(value as CreativeAssetType | 'all')}>
              <SelectTrigger className="sm:w-36" title="筛选素材类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAssets.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5" aria-live="polite">
              <span className="text-sm text-primary">已选择 {selectedAssets.length} 个素材</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedAssets([])} title="清空已选择的素材">清空选择</Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground" role="status" aria-label="正在读取素材库">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />正在读取素材库
            </div>
          ) : error !== null ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
              <p className="text-sm font-medium">暂时无法读取素材列表</p>
              <p className="text-xs text-muted-foreground">错误详情已通过右上角通知显示。</p>
              <Button size="sm" variant="outline" onClick={() => setReloadToken(current => current + 1)}>重新加载</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
              <FolderPlus className="size-8" />
              <p>没有可添加的素材</p>
              <p className="text-xs">当前筛选下的素材都已在项目中，或素材库还为空。</p>
            </div>
          ) : (
            <div className="grid max-h-[min(490px,55svh)] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {items.map(item => {
                const isSelected = selectedAssets.some(asset => asset.id === item.id)
                const previewUrl = item.preview?.thumbnailUrl ?? item.preview?.url
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? '取消选择' : '选择'}素材 ${item.name}`}
                    title={`${isSelected ? '取消选择' : '选择'}素材：${item.name}`}
                    onClick={() => toggle(item)}
                    className={`group relative overflow-hidden rounded-xl border text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}
                  >
                    <div className="aspect-[4/3] bg-muted">
                      {previewUrl ? (
                        <img src={resolveApiUrl(previewUrl)} alt={`${item.name}预览`} className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center"><ImageIcon className="size-7 text-muted-foreground" aria-hidden="true" /></div>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {creativeAssetTypeLabel(item.type)} · {item.latestVersion ? `v${item.latestVersion.version}` : '未生成版本'}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {creativeAssetVersionStatusLabel(item.latestVersion?.status)}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} title="取消添加素材">取消</Button>
          <Button type="button" onClick={handleConfirm} disabled={selectedAssets.length === 0} title="将已选择的素材添加到项目">
            添加所选素材（{selectedAssets.length}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
