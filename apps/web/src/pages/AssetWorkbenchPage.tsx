import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
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
import type { CreativeAssetSummary, CreativeAssetType, CreativeProject } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  creativeAssetTypeLabel,
  creativeAssetVersionStatusLabel,
} from '@/lib/labels'
import { resolveApiUrl } from '@/lib/api'
import { creativeAssetQueryKey, useCreativeAssetsStore } from '@/stores/creative-assets-store'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'

const ASSET_TABS = [
  { value: 'all', label: '全部素材' },
  { value: 'projects', label: '项目' },
  { value: 'character', label: '主体' },
  { value: 'environment', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'style', label: '风格' },
  { value: 'pending', label: '待确认' },
] as const

type AssetTab = (typeof ASSET_TABS)[number]['value']
type AssetView = 'grid' | 'list'

const ASSET_TYPES: readonly CreativeAssetType[] = ['character', 'environment', 'prop', 'style']

function isAssetTab(value: string | null): value is AssetTab {
  return value !== null && ASSET_TABS.some(tab => tab.value === value)
}

function isAssetView(value: string | null): value is AssetView {
  return value === 'grid' || value === 'list'
}

function previewUrlFromMetadata(asset: CreativeAssetSummary): string | undefined {
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
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

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
    if (tab === 'projects') return
    void loadAssets(assetQuery)
  }, [assetQuery, loadAssets, tab])

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

  function setParam(key: string, value: string | undefined) {
    setSearchParams(updateSearchParams(searchParams, { [key]: value }))
  }

  function handleTabChange(nextTab: AssetTab) {
    setSearchParams(updateSearchParams(searchParams, { tab: nextTab === 'all' ? undefined : nextTab }))
  }

  function handleProjectChange(nextProjectId: string) {
    setSearchParams(updateSearchParams(searchParams, { projectId: nextProjectId }))
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
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">素材库</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                按项目整理主体、场景、道具和风格，确认版本后再带入下一次生成。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={projectId ?? 'all'} onValueChange={handleProjectChange}>
                <SelectTrigger className="w-40 bg-background/80">
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
              <Button variant="outline" onClick={() => setCreateProjectOpen(true)}>
                <Plus className="size-4" />
                新建项目
              </Button>
              <Button onClick={() => navigate(`/create${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)}>
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
                className="h-11 bg-background/80 pl-9 pr-9"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => setSearchInput('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Button variant="outline" disabled title="上传入口将在资产上传协议接入后开放">
                <Upload className="size-4" />
                上传素材
              </Button>
              <fieldset className="flex rounded-lg border border-border bg-background/70 p-1">
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

        {tab === 'projects' ? (
          <ProjectGrid
            projects={projects}
            isLoading={projectState?.isLoading ?? false}
            error={projectState?.error ?? null}
            onSelect={project => handleProjectChange(project.id)}
            onCreate={() => setCreateProjectOpen(true)}
          />
        ) : (
          <AssetCollection
            items={assetState?.items ?? []}
            view={view}
            isLoading={assetState?.isLoading ?? false}
            isLoadingMore={assetState?.isLoadingMore ?? false}
            hasNextPage={assetState?.nextCursor !== undefined}
            error={assetState?.error ?? null}
            tab={tab}
            onLoadMore={() => void loadMoreAssets(assetQuery)}
            onRetry={() => void loadAssets(assetQuery, true)}
            onCreate={() => navigate(`/create${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`)}
          />
        )}
      </div>

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={project => {
          setCreateProjectOpen(false)
          setSearchParams(updateSearchParams(searchParams, { projectId: project.id, tab: undefined }))
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
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-md p-2 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
  tab,
  onLoadMore,
  onRetry,
  onCreate,
}: {
  items: CreativeAssetSummary[]
  view: AssetView
  isLoading: boolean
  isLoadingMore: boolean
  hasNextPage: boolean
  error: string | null
  tab: AssetTab
  onLoadMore: () => void
  onRetry: () => void
  onCreate: () => void
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
            <h2 className="text-base font-semibold">{tab === 'pending' ? '没有待确认素材' : '这个项目还没有素材'}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {tab === 'pending' ? '新生成的候选版本会在这里等待你的确认。' : '先创建主体、场景或道具，再把确认版本带入下一次生成。'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onCreate}><Sparkles className="size-4" />生成素材</Button>
            <Button variant="outline" disabled><Upload className="size-4" />上传素材</Button>
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

function ProjectGrid({
  projects,
  isLoading,
  error,
  onSelect,
  onCreate,
}: {
  projects: CreativeProject[]
  isLoading: boolean
  error: string | null
  onSelect: (project: CreativeProject) => void
  onCreate: () => void
}) {
  if (isLoading && projects.length === 0) return <AssetSkeleton view="grid" />
  if (error && projects.length === 0) {
    return <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center"><p className="text-sm font-medium">项目暂时加载失败</p><p className="text-sm text-muted-foreground">{error}</p></div>
  }
  if (projects.length === 0) {
    return <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><FolderKanban className="size-8 text-primary" /><h2 className="text-base font-semibold">还没有创作项目</h2><p className="text-sm text-muted-foreground">先用项目把短剧素材分开，之后可以跨项目复用主体和场景。</p><Button onClick={onCreate}><Plus className="size-4" />新建项目</Button></div>
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map(project => (
        <button key={project.id} type="button" onClick={() => onSelect(project)} className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-primary"><FolderKanban className="size-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{project.title}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{project.description || '还没有项目描述'}</p></div>
          </div>
          <div className="relative mt-6 flex items-center justify-between text-xs text-muted-foreground"><span>{project.status === 'active' ? '活跃项目' : project.status === 'archived' ? '已归档' : '草稿项目'}</span><span>打开项目 →</span></div>
        </button>
      ))}
    </div>
  )
}

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: CreativeProject) => void
}) {
  const createProject = useCreativeProjectsStore(state => state.create)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setError(null)
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      setError('请输入项目名称')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const project = await createProject({ title: normalizedTitle, ...(description.trim() ? { description: description.trim() } : {}) })
      setTitle('')
      setDescription('')
      onCreated(project)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建项目失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>新建创作项目</DialogTitle><DialogDescription>项目用于整理一部短剧或一个系列的主体、场景、道具和风格资产。</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2"><Label htmlFor="creative-project-title">项目名称</Label><Input id="creative-project-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：夜班便利店" maxLength={120} autoFocus /></div>
          <div className="space-y-2"><Label htmlFor="creative-project-description">项目描述 <span className="font-normal text-muted-foreground">（可选）</span></Label><Textarea id="creative-project-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="记录这个项目的视觉方向或使用范围" maxLength={2_000} rows={4} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '正在创建…' : '创建项目'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
