import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  FolderKanban,
  Grid2X2,
  List,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import type { CreativeAssetSummary, CreativeAssetType } from '@bailian-studio/api-client'
import { UploadCreativeAssetDialog } from '@/components/assets/UploadCreativeAssetDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  creativeAssetTypeLabel,
  creativeAssetVersionStatusLabel,
} from '@/lib/labels'
import { resolveApiUrl } from '@/lib/api'
import { creativeAssetQueryKey, useCreativeAssetsStore } from '@/stores/creative-assets-store'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'

const ASSET_TABS = [
  { value: 'all', label: '全部素材' },
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
] as const

type AssetTab = (typeof ASSET_TABS)[number]['value']
type AssetView = 'grid' | 'list'

const ASSET_TYPES: readonly CreativeAssetType[] = ['character', 'environment', 'prop']

function isAssetTab(value: string | null): value is AssetTab {
  return value !== null && ASSET_TABS.some(tab => tab.value === value)
}

function isAssetView(value: string | null): value is AssetView {
  return value === 'grid' || value === 'list'
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

function assetTypeTone(type: string): string {
  switch (type) {
    case 'character':
      return 'bg-[#3b2830] text-[#f4b4bd]'
    case 'environment':
      return 'bg-[#293633] text-[#b4d4c5]'
    case 'prop':
      return 'bg-[#3b3425] text-[#e6c78d]'
    case 'style':
      return 'bg-[#322c3a] text-[#d5c3e5]'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function versionTone(status: string | undefined): string {
  switch (status) {
    case 'approved':
      return 'border-[#a5d09d]/30 bg-[#a5d09d]/10 text-[#b9dfb1]'
    case 'candidate':
      return 'border-[#e1b15c]/30 bg-[#e1b15c]/10 text-[#e6c78d]'
    case 'generating':
      return 'border-[#8ab9d4]/30 bg-[#8ab9d4]/10 text-[#b6d9e8]'
    case 'rejected':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    default:
      return 'border-border bg-muted/40 text-muted-foreground'
  }
}

function updateSearchParams(
  current: URLSearchParams,
  updates: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value.length === 0 || value === 'all') next.delete(key)
    else next.set(key, value)
  }
  return next
}

export function AssetWorkbenchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab: AssetTab = isAssetTab(rawTab) ? rawTab : 'all'
  const projectId = searchParams.get('projectId') ?? undefined
  const queryText = searchParams.get('q') ?? ''
  const view: AssetView = isAssetView(searchParams.get('view')) ? (searchParams.get('view') as AssetView) : 'grid'
  const type = ASSET_TYPES.includes(tab as CreativeAssetType) ? (tab as CreativeAssetType) : undefined
  const [searchInput, setSearchInput] = useState(queryText)
  const [uploadOpen, setUploadOpen] = useState(false)

  const loadProjects = useCreativeProjectsStore(state => state.load)
  const projectState = useCreativeProjectsStore(state => state.queries[creativeProjectQueryKey()])
  const projects = projectState?.items ?? []

  const assetQuery = useMemo(
    () => ({
      ...(projectId ? { projectId } : {}),
      ...(type ? { type } : {}),
      ...(queryText ? { q: queryText } : {}),
    }),
    [projectId, queryText, type],
  )
  const assetQueryKey = creativeAssetQueryKey(assetQuery)
  const assetState = useCreativeAssetsStore(state => state.queries[assetQueryKey])
  const loadAssets = useCreativeAssetsStore(state => state.load)
  const loadMoreAssets = useCreativeAssetsStore(state => state.loadMore)

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    void loadAssets(assetQuery)
  }, [assetQuery, loadAssets])

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

  const activeProject = projects.find(project => project.id === projectId)
  const defaultUploadType: CreativeAssetType = ASSET_TYPES.includes(tab as CreativeAssetType)
    ? (tab as CreativeAssetType)
    : 'character'

  function setParam(key: string, value: string | undefined) {
    setSearchParams(updateSearchParams(searchParams, { [key]: value }))
  }

  function handleTabChange(nextTab: AssetTab) {
    setSearchParams(updateSearchParams(searchParams, {
      tab: nextTab === 'all' ? undefined : nextTab,
    }))
  }

  function handleProjectChange(nextProjectId: string) {
    setSearchParams(updateSearchParams(searchParams, {
      projectId: nextProjectId,
      tab,
    }))
  }

  return (
    <div className="relative isolate min-h-[calc(100svh-3rem)] overflow-hidden">
      <AmbientPointField />
      <div className="relative z-10 mx-auto flex w-full max-w-[1660px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="mr-auto min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>素材库</span>
                {activeProject && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span className="truncate">{activeProject.title}</span>
                  </>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{activeProject?.title ?? '素材库'}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                按项目整理主体、场景和道具，确认版本后再带入下一次生成。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={projectId ?? 'all'} onValueChange={handleProjectChange}>
                <SelectTrigger className="h-[42px] data-[size=default]:h-[42px] w-40 bg-background/80" title="按项目筛选素材">
                  <FolderKanban className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="全部项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="h-[42px]" onClick={() => navigate('/projects')} title="前往项目管理">
                <Plus className="size-4" />
                新建项目
              </Button>
              <Button className="h-[42px]" onClick={() => navigate(`/create${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)} title="打开素材生成页">
                <Sparkles className="size-4" />
                生成素材
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-xl">
              <label htmlFor="asset-search" className="sr-only">
                搜索素材
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="asset-search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="搜索素材、项目或提示词"
                title="搜索素材、项目或提示词"
                className="h-[42px] bg-background/80 pl-9 pr-9"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="清除搜索"
                  title="清除搜索"
                  onClick={() => setSearchInput('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Button variant="outline" className="h-[42px]" onClick={() => setUploadOpen(true)} title="上传素材到素材库">
                <Upload className="size-4" />
                上传素材
              </Button>
              <fieldset className="flex h-[42px] shrink-0 items-center rounded-lg border border-border bg-background/70 p-1">
                <legend className="sr-only">视图切换</legend>
                <ViewButton active={view === 'grid'} label="网格视图" onClick={() => setParam('view', 'grid')}>
                  <Grid2X2 className="size-4" />
                </ViewButton>
                <ViewButton active={view === 'list'} label="列表视图" onClick={() => setParam('view', 'list')}>
                  <List className="size-4" />
                </ViewButton>
              </fieldset>
            </div>
          </div>
        </header>

        <nav className="-mb-1 flex gap-1 overflow-x-auto pb-1" aria-label="素材类型">
          {ASSET_TABS.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => handleTabChange(item.value)}
                aria-current={tab === item.value ? 'page' : undefined}
                title={`查看${item.label}`}
              className={[
                'shrink-0 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === item.value
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <AssetCollection
          items={assetState?.items ?? []}
          view={view}
          isLoading={assetState?.isLoading ?? false}
          isLoadingMore={assetState?.isLoadingMore ?? false}
          hasNextPage={assetState?.nextCursor !== undefined}
          error={assetState?.error ?? null}
          onLoadMore={() => void loadMoreAssets(assetQuery)}
          onRetry={() => void loadAssets(assetQuery, true)}
          onCreate={() => navigate(`/create${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)}
          onUpload={() => setUploadOpen(true)}
        />
      </div>

      <UploadCreativeAssetDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projects={projects}
        projectId={projectId}
        defaultType={defaultUploadType}
        onCreated={asset => {
          setUploadOpen(false)
          void loadAssets(assetQuery, true)
          void loadProjects({}, true)
          navigate(`/assets/${encodeURIComponent(asset.id)}`)
        }}
      />
    </div>
  )
}

function AmbientPointField() {
  const pointStyle: CSSProperties = {
    backgroundImage: 'radial-gradient(circle, rgb(216 183 228 / 0.55) 1px, transparent 1.5px)',
    backgroundSize: '18px 18px',
    maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)',
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
      <div className="absolute -top-40 right-[-12rem] h-[38rem] w-[38rem] rotate-[-16deg]" style={pointStyle} />
      <div
        className="absolute top-24 right-[-8rem] h-[28rem] w-[46rem] rotate-[-16deg] opacity-60"
        style={{ ...pointStyle, backgroundSize: '14px 14px' }}
      />
    </div>
  )
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'flex size-8 items-center justify-center rounded-md p-0 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function AssetCollection({
  items,
  view,
  isLoading,
  isLoadingMore,
  hasNextPage,
  error,
  onLoadMore,
  onRetry,
  onCreate,
  onUpload,
}: {
  items: CreativeAssetSummary[]
  view: AssetView
  isLoading: boolean
  isLoadingMore: boolean
  hasNextPage: boolean
  error: string | null
  onLoadMore: () => void
  onRetry: () => void
  onCreate: () => void
  onUpload: () => void
}) {
  if (isLoading && items.length === 0) {
    return <AssetSkeleton view={view} />
  }

  if (error && items.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium">素材暂时加载失败</p>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={onRetry}>重新加载</Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
        <div className="relative z-10 flex max-w-md flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/70 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">这个项目还没有素材</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">先创建主体、场景或道具，再把确认版本带入下一次生成。</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onCreate}><Sparkles className="size-4" />生成素材</Button>
            <Button variant="outline" onClick={onUpload}><Upload className="size-4" />上传素材</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{items.length} 个素材</span>
        {isLoading && <span className="text-primary">正在更新</span>}
        {error && <span className="text-destructive">部分筛选加载失败</span>}
      </div>
      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map(asset => <CreativeAssetTile key={asset.id} asset={asset} />)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/60">
          <div className="hidden grid-cols-[minmax(0,1.8fr)_120px_140px_140px] gap-4 border-b border-border px-4 py-3 text-xs text-muted-foreground sm:grid">
            <span>素材</span><span>类型</span><span>版本</span><span>状态</span>
          </div>
          {items.map(asset => <CreativeAssetRow key={asset.id} asset={asset} />)}
        </div>
      )}
      {hasNextPage && (
        <div className="flex justify-center pb-2">
          <Button variant="outline" size="sm" disabled={isLoadingMore} onClick={onLoadMore}>
            {isLoadingMore ? '正在加载…' : '加载更多'}
          </Button>
        </div>
      )}
    </>
  )
}

function AssetSkeleton({ view }: { view: AssetView }) {
  if (view === 'list') {
    return <div className="space-y-2" role="status" aria-label="正在加载素材"><div className="h-12 animate-pulse rounded-lg bg-muted/70" /><div className="h-12 animate-pulse rounded-lg bg-muted/70" /><div className="h-12 animate-pulse rounded-lg bg-muted/70" /></div>
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" role="status" aria-label="正在加载素材">
      {Array.from({ length: 12 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-xl bg-muted/70" />)}
    </div>
  )
}

function CreativeAssetTile({ asset }: { asset: CreativeAssetSummary }) {
  const navigate = useNavigate()
  const versionStatus = asset.latestVersion?.status
  const previewUrl = previewUrlFromMetadata(asset)

  return (
    <button
      type="button"
      onClick={() => navigate(`/assets/${encodeURIComponent(asset.id)}`)}
      title={`打开素材：${asset.name}`}
      className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_8px_24px_rgb(0_0_0_/_0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CreativeAssetPreview asset={asset} previewUrl={previewUrl} />
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{asset.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{asset.latestVersion ? `v${asset.latestVersion.version}` : '未生成'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{creativeAssetTypeLabel(asset.type)}</span>
          <span className={`rounded-full border px-1.5 py-0.5 ${versionTone(versionStatus)}`}>
            {creativeAssetVersionStatusLabel(versionStatus)}
          </span>
        </div>
      </div>
    </button>
  )
}

function CreativeAssetRow({ asset }: { asset: CreativeAssetSummary }) {
  const navigate = useNavigate()
  const versionStatus = asset.latestVersion?.status
  return (
    <button
      type="button"
      onClick={() => navigate(`/assets/${encodeURIComponent(asset.id)}`)}
      title={`打开素材：${asset.name}`}
      className="grid w-full grid-cols-1 gap-2 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1.8fr)_120px_140px_140px] sm:items-center sm:gap-4"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${assetTypeTone(asset.type)}`}>
          {creativeAssetTypeLabel(asset.type).slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{asset.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{asset.description || '暂无描述'}</span>
        </span>
      </span>
      <span className="text-xs text-muted-foreground">{creativeAssetTypeLabel(asset.type)}</span>
      <span className="text-xs text-muted-foreground">{asset.latestVersion ? `v${asset.latestVersion.version}` : '未生成版本'}</span>
      <span className={`w-fit rounded-full border px-2 py-1 text-xs ${versionTone(versionStatus)}`}>
        {creativeAssetVersionStatusLabel(versionStatus)}
      </span>
    </button>
  )
}

function CreativeAssetPreview({ asset, previewUrl }: { asset: CreativeAssetSummary; previewUrl?: string }) {
  if (previewUrl) {
    return <img src={previewUrl} alt={`${asset.name}预览`} className="aspect-[4/5] w-full object-cover" />
  }

  return (
    <div className="relative flex aspect-[4/5] items-end overflow-hidden bg-muted/60 p-3">
      <div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at 72% 24%, rgb(228 107 120 / 0.28), transparent 44%), radial-gradient(circle at 20% 82%, rgb(126 157 143 / 0.2), transparent 42%)' }} />
      <div className="relative flex w-full items-end justify-between gap-2">
        <div>
          <div className="text-3xl font-semibold tracking-tight text-foreground/80">{creativeAssetTypeLabel(asset.type)}</div>
          <div className="mt-1 text-xs text-muted-foreground">版本预览随详情引用加载</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${assetTypeTone(asset.type)}`}>
          {asset.latestVersion ? `v${asset.latestVersion.version}` : '未生成'}
        </span>
      </div>
    </div>
  )
}
