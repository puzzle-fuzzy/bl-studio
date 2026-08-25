import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, FolderKanban, Grid2X2, Image as ImageIcon, List, Loader2, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { CreativeAssetSummary, CreativeAssetType } from '@bailian-studio/api-client'
import { CreativeProjectAssetPickerDialog } from '@/components/assets/CreativeProjectAssetPickerDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { resolveApiUrl } from '@/lib/api'
import { creativeAssetStatusLabel, creativeAssetTypeLabel, creativeAssetVersionStatusLabel } from '@/lib/labels'
import { userErrorMessage } from '@/lib/user-error'
import { useCreativeProjectsStore } from '@/stores/creative-projects-store'
import { toast } from 'sonner'

const ASSET_TYPES: readonly CreativeAssetType[] = ['character', 'environment', 'prop', 'style']
type AssetView = 'grid' | 'list'

function isAssetView(value: string | null): value is AssetView {
  return value === 'grid' || value === 'list'
}

function isAssetType(value: string | null): value is CreativeAssetType {
  return value !== null && ASSET_TYPES.includes(value as CreativeAssetType)
}

function previewUrlFromMetadata(asset: CreativeAssetSummary): string | undefined {
  if (asset.preview?.thumbnailUrl !== undefined) return resolveApiUrl(asset.preview.thumbnailUrl)
  if (asset.preview?.url !== undefined) return resolveApiUrl(asset.preview.url)
  for (const key of ['previewUrl', 'thumbnailUrl', 'coverUrl']) {
    const value = asset.metadata[key]
    if (typeof value === 'string' && value.trim().length > 0) return resolveApiUrl(value)
  }
  return undefined
}

function versionTone(status: string | undefined): string {
  switch (status) {
    case 'approved':
      return 'border-[#a5d09d]/30 bg-[#a5d09d]/10 text-[#477241] dark:text-[#b9dfb1]'
    case 'candidate':
      return 'border-[#e1b15c]/30 bg-[#e1b15c]/10 text-[#806221] dark:text-[#e6c78d]'
    case 'generating':
      return 'border-[#8ab9d4]/30 bg-[#8ab9d4]/10 text-[#3c6f86] dark:text-[#b6d9e8]'
    case 'rejected':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    default:
      return 'border-border bg-muted/40 text-muted-foreground'
  }
}

function assetTypeTone(type: string): string {
  switch (type) {
    case 'character':
      return 'bg-[#f2e2e6] text-[#7d3f4b] dark:bg-[#3b2830] dark:text-[#f4b4bd]'
    case 'environment':
      return 'bg-[#e1ebe6] text-[#416654] dark:bg-[#293633] dark:text-[#b4d4c5]'
    case 'prop':
      return 'bg-[#f1e9d8] text-[#806a35] dark:bg-[#3b3425] dark:text-[#e6c78d]'
    case 'style':
      return 'bg-[#ece5f2] text-[#69517d] dark:bg-[#322c3a] dark:text-[#d5c3e5]'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function updateSearchParams(current: URLSearchParams, updates: Record<string, string | undefined>): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value.length === 0 || value === 'all') next.delete(key)
    else next.set(key, value)
  }
  return next
}

export function CreativeProjectDetailPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryText = searchParams.get('q') ?? ''
  const type = isAssetType(searchParams.get('type')) ? (searchParams.get('type') as CreativeAssetType) : undefined
  const view: AssetView = isAssetView(searchParams.get('view')) ? (searchParams.get('view') as AssetView) : 'grid'
  const [searchInput, setSearchInput] = useState(queryText)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isMutating, setIsMutating] = useState(false)

  const detailState = useCreativeProjectsStore(state => (projectId ? state.details[projectId] : undefined))
  const loadDetail = useCreativeProjectsStore(state => state.loadDetail)
  const attachAssets = useCreativeProjectsStore(state => state.attachAssets)
  const detachAssets = useCreativeProjectsStore(state => state.detachAssets)
  const project = detailState?.project

  useEffect(() => {
    if (projectId === undefined) return
    void loadDetail(projectId)
  }, [loadDetail, projectId])

  useEffect(() => {
    setSearchInput(queryText)
  }, [queryText])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput === queryText) return
      setSearchParams(updateSearchParams(searchParams, { q: searchInput.trim() || undefined }), { replace: true })
    }, 260)
    return () => window.clearTimeout(timer)
  }, [queryText, searchInput, searchParams, setSearchParams])

  useEffect(() => {
    if (projectId === undefined) return
    setSelectedIds(new Set())
  }, [projectId])

  const assets = project?.assets ?? []
  const filteredAssets = useMemo(() => {
    const normalizedQuery = queryText.trim().toLocaleLowerCase()
    return assets.filter(asset => {
      if (type !== undefined && asset.type !== type) return false
      if (normalizedQuery.length === 0) return true
      return [asset.name, asset.description ?? ''].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
    })
  }, [assets, queryText, type])
  const selectedAssets = useMemo(() => assets.filter(asset => selectedIds.has(asset.id)), [assets, selectedIds])
  const excludedAssetIds = useMemo(() => new Set(assets.map(asset => asset.id)), [assets])
  const allVisibleSelected = filteredAssets.length > 0 && filteredAssets.every(asset => selectedIds.has(asset.id))
  const someVisibleSelected = filteredAssets.some(asset => selectedIds.has(asset.id))
  const isArchived = project?.status === 'archived'

  const counts = useMemo(() => ASSET_TYPES.map(assetType => ({
    type: assetType,
    count: assets.filter(asset => asset.type === assetType).length,
  })), [assets])

  function setParam(key: string, value: string | undefined) {
    setSearchParams(updateSearchParams(searchParams, { [key]: value }))
  }

  function toggleAsset(assetId: string) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  function toggleVisibleAssets(checked: boolean | 'indeterminate') {
    if (checked === 'indeterminate' || checked === true) {
      setSelectedIds(current => new Set([...current, ...filteredAssets.map(asset => asset.id)]))
      return
    }
    setSelectedIds(current => {
      const next = new Set(current)
      for (const asset of filteredAssets) next.delete(asset.id)
      return next
    })
  }

  async function handleAttach(selected: CreativeAssetSummary[]) {
    if (projectId === undefined || selected.length === 0) return
    setIsMutating(true)
    try {
      await attachAssets(projectId, selected.map(asset => asset.id))
      toast.success(`已添加 ${selected.length} 个素材到项目`)
    } catch (error) {
      toast.error(userErrorMessage(error))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleDetach() {
    if (projectId === undefined || selectedAssets.length === 0 || isMutating) return
    const confirmed = window.confirm(`确认将选中的 ${selectedAssets.length} 个素材移出“${project?.title ?? '当前项目'}”？素材本身不会被删除。`)
    if (!confirmed) return
    setIsMutating(true)
    try {
      await detachAssets(projectId, selectedAssets.map(asset => asset.id))
      setSelectedIds(new Set())
      toast.success(`已将 ${selectedAssets.length} 个素材移出项目`)
    } catch (error) {
      toast.error(userErrorMessage(error))
    } finally {
      setIsMutating(false)
    }
  }

  if (projectId === undefined) {
    return <ProjectErrorState title="项目地址无效" description="请从素材库重新进入项目。" onBack={() => navigate('/assets?tab=projects')} />
  }

  if (detailState?.isLoading && project === null) {
    return <ProjectLoadingState />
  }

  if (detailState?.error && project === null) {
    return <ProjectErrorState title="项目暂时无法打开" description={detailState.error} onBack={() => navigate('/assets?tab=projects')} />
  }

  if (project === null || project === undefined) {
    return <ProjectLoadingState />
  }

  return (
    <div className="relative isolate min-h-[calc(100svh-3rem)] overflow-hidden">
      <AmbientPointField />
      <div className="relative z-10 mx-auto flex w-full max-w-[1660px] flex-col gap-5">
        <header className="border-b border-border/70 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Link to="/assets" className="transition-colors hover:text-foreground">素材库</Link>
                <span aria-hidden="true">/</span>
                <span className="truncate">项目详情</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary">
                  <FolderKanban className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{project.title}</h1>
                    <span className="rounded-full border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">{creativeAssetStatusLabel(project.status)}</span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{project.description || '还没有项目描述。把一部短剧或一个系列需要复用的视觉资产集中在这里。'}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              <Button asChild variant="outline">
                <Link to="/assets"><ArrowLeft className="size-4" />返回素材库</Link>
              </Button>
              <Button variant="outline" disabled={isArchived || isMutating} onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" />添加已有素材
              </Button>
              <Button asChild disabled={isMutating}>
                <Link to={`/create?projectId=${encodeURIComponent(project.id)}`}><Sparkles className="size-4" />生成素材</Link>
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span><strong className="mr-1 text-foreground">{assets.length}</strong>个素材</span>
            {counts.map(item => <span key={item.type}><strong className="mr-1 text-foreground">{item.count}</strong>{creativeAssetTypeLabel(item.type)}</span>)}
            {detailState?.isLoading && <span className="text-primary">正在同步项目</span>}
          </div>
        </header>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <label htmlFor="project-asset-search" className="sr-only">搜索项目素材</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="project-asset-search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="搜索项目内素材" className="h-11 bg-background/80 pl-9 pr-9" />
            {searchInput && (
              <button type="button" aria-label="清除搜索" onClick={() => setSearchInput('')} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <Select value={type ?? 'all'} onValueChange={value => setParam('type', value)}>
              <SelectTrigger className="w-32 bg-background/80"><SelectValue placeholder="全部类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {ASSET_TYPES.map(assetType => <SelectItem key={assetType} value={assetType}>{creativeAssetTypeLabel(assetType)}</SelectItem>)}
              </SelectContent>
            </Select>
            <fieldset className="flex rounded-lg border border-border bg-background/70 p-1">
              <legend className="sr-only">视图切换</legend>
              <ViewButton active={view === 'grid'} label="网格视图" onClick={() => setParam('view', 'grid')}><Grid2X2 className="size-4" /></ViewButton>
              <ViewButton active={view === 'list'} label="列表视图" onClick={() => setParam('view', 'list')}><List className="size-4" /></ViewButton>
            </fieldset>
          </div>
        </div>

        {assets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox aria-label="选择当前视图中的全部素材" checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false} onCheckedChange={toggleVisibleAssets} disabled={filteredAssets.length === 0 || isMutating} />
              <span>选择当前视图</span>
            </div>
            <span className="text-xs text-muted-foreground">{filteredAssets.length} 个匹配素材</span>
          </div>
        )}

        {selectedAssets.length > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-background/95 px-4 py-3 shadow-lg shadow-primary/5 backdrop-blur">
            <span className="text-sm font-medium text-primary">已选择 {selectedAssets.length} 个素材</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">批量移出只会解除项目归属，不会删除素材。</span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={isMutating} onClick={() => setSelectedIds(new Set())}>清空选择</Button>
              <Button variant="destructive" size="sm" disabled={isArchived || isMutating} onClick={() => void handleDetach()}>
                {isMutating ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                移出项目
              </Button>
            </div>
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <ProjectEmptyState hasAssets={assets.length > 0} onAdd={() => setPickerOpen(true)} onCreate={() => navigate(`/create?projectId=${encodeURIComponent(project.id)}`)} onClear={() => setSearchParams(updateSearchParams(searchParams, { q: undefined, type: undefined }))} disabled={isArchived || isMutating} />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredAssets.map(asset => <ProjectAssetTile key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} disabled={isMutating} onToggle={() => toggleAsset(asset.id)} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card/60">
            <div className="hidden grid-cols-[34px_minmax(0,1.8fr)_120px_150px] gap-4 border-b border-border px-4 py-3 text-xs text-muted-foreground sm:grid">
              <span aria-hidden="true" /><span>素材</span><span>类型</span><span>版本状态</span>
            </div>
            {filteredAssets.map(asset => <ProjectAssetRow key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} disabled={isMutating} onToggle={() => toggleAsset(asset.id)} />)}
          </div>
        )}
      </div>

      <CreativeProjectAssetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} excludedAssetIds={excludedAssetIds} onConfirm={assetsToAttach => void handleAttach(assetsToAttach)} />
    </div>
  )
}

function ViewButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={`rounded-md p-2 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground'}`}>{children}</button>
}

function ProjectAssetTile({ asset, selected, disabled, onToggle }: { asset: CreativeAssetSummary; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const previewUrl = previewUrlFromMetadata(asset)
  const versionStatus = asset.latestVersion?.status
  return (
    <article className={`group relative overflow-hidden rounded-xl border bg-card text-left transition-[border-color,transform,box-shadow] duration-200 ${selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_8px_24px_rgb(0_0_0_/_0.12)]'}`}>
      <Link to={`/assets/${encodeURIComponent(asset.id)}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <AssetPreview asset={asset} previewUrl={previewUrl} />
        <div className="space-y-2 p-3">
          <div className="flex items-start gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{asset.name}</span><span className="shrink-0 text-[11px] text-muted-foreground">{asset.latestVersion ? `v${asset.latestVersion.version}` : '未生成'}</span></div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{creativeAssetTypeLabel(asset.type)}</span><span className={`rounded-full border px-1.5 py-0.5 ${versionTone(versionStatus)}`}>{creativeAssetVersionStatusLabel(versionStatus)}</span></div>
        </div>
      </Link>
      <div className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full border border-white/70 bg-background/85 shadow-sm backdrop-blur transition-colors hover:bg-background">
        <Checkbox aria-label={`选择 ${asset.name}`} checked={selected} onCheckedChange={onToggle} disabled={disabled} className="size-4 bg-background/80" />
      </div>
    </article>
  )
}

function ProjectAssetRow({ asset, selected, disabled, onToggle }: { asset: CreativeAssetSummary; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const versionStatus = asset.latestVersion?.status
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[34px_minmax(0,1.8fr)_120px_150px] sm:items-center sm:gap-4">
      <div className="flex size-7 items-center justify-center rounded-full hover:bg-muted"><Checkbox aria-label={`选择 ${asset.name}`} checked={selected} onCheckedChange={onToggle} disabled={disabled} /></div>
      <Link to={`/assets/${encodeURIComponent(asset.id)}`} className="flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${assetTypeTone(asset.type)}`}>{creativeAssetTypeLabel(asset.type).slice(0, 1)}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{asset.name}</span><span className="block truncate text-xs text-muted-foreground">{asset.description || '暂无描述'}</span></span>
      </Link>
      <span className="hidden text-xs text-muted-foreground sm:block">{creativeAssetTypeLabel(asset.type)}</span>
      <span className={`hidden w-fit rounded-full border px-2 py-1 text-xs sm:block ${versionTone(versionStatus)}`}>{creativeAssetVersionStatusLabel(versionStatus)}</span>
    </div>
  )
}

function AssetPreview({ asset, previewUrl }: { asset: CreativeAssetSummary; previewUrl?: string }) {
  if (previewUrl) return <img src={previewUrl} alt={`${asset.name}预览`} className="aspect-[4/5] w-full object-cover" />
  return <div className="relative flex aspect-[4/5] items-end overflow-hidden bg-muted/60 p-3"><div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at 72% 24%, rgb(228 107 120 / 0.28), transparent 44%), radial-gradient(circle at 20% 82%, rgb(126 157 143 / 0.2), transparent 42%)' }} /><div className="relative flex w-full items-end justify-between gap-2"><div><div className="text-3xl font-semibold tracking-tight text-foreground/80">{creativeAssetTypeLabel(asset.type)}</div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="size-3" />详情页查看参考图</div></div><span className={`rounded-full border px-2 py-1 text-[11px] ${assetTypeTone(asset.type)}`}>{asset.latestVersion ? `v${asset.latestVersion.version}` : '未生成'}</span></div></div>
}

function ProjectEmptyState({ hasAssets, onAdd, onCreate, onClear, disabled }: { hasAssets: boolean; onAdd: () => void; onCreate: () => void; onClear: () => void; disabled: boolean }) {
  return <div className="relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><div className="relative z-10 flex max-w-md flex-col items-center gap-3"><div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/70 text-primary"><FolderKanban className="size-5" /></div><div><h2 className="text-base font-semibold">{hasAssets ? '没有匹配的素材' : '这个项目还没有素材'}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{hasAssets ? '换一个关键词或类型筛选，继续整理项目内容。' : '先添加已有素材，或直接生成一个新的主体、场景或道具。'}</p></div><div className="flex flex-wrap justify-center gap-2">{hasAssets ? <Button variant="outline" onClick={onClear}>清除筛选</Button> : <><Button onClick={onAdd} disabled={disabled}><Plus className="size-4" />添加已有素材</Button><Button variant="outline" onClick={onCreate} disabled={disabled}><Sparkles className="size-4" />生成素材</Button></>}</div></div></div>
}

function ProjectLoadingState() {
  return <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />正在打开项目…</div>
}

function ProjectErrorState({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  return <div className="flex min-h-[calc(100svh-8rem)] flex-col items-center justify-center gap-3 p-8 text-center"><FolderKanban className="size-9 text-muted-foreground" /><h1 className="text-xl font-semibold">{title}</h1><p className="max-w-md text-sm text-muted-foreground">{description}</p><Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" />返回项目列表</Button></div>
}

function AmbientPointField() {
  const pointStyle: CSSProperties = { backgroundImage: 'radial-gradient(circle, rgb(216 183 228 / 0.55) 1px, transparent 1.5px)', backgroundSize: '18px 18px', maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-40"><div className="absolute -top-40 right-[-12rem] h-[38rem] w-[38rem] rotate-[-16deg]" style={pointStyle} /><div className="absolute top-24 right-[-8rem] h-[28rem] w-[46rem] rotate-[-16deg] opacity-60" style={{ ...pointStyle, backgroundSize: '14px 14px' }} /></div>
}
