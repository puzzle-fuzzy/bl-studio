import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Check, CheckCircle2, FolderKanban, Image as ImageIcon, Layers3, Loader2, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import type {
  AssetItem,
  CreativeAssetReference,
  CreativeAssetReferenceRole,
  CreativeProject,
  CreativeAssetType,
  CreativeAssetVersion,
} from '@bailian-studio/api-client'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { CreativeAssetProjectDialog } from '@/components/assets/CreativeAssetProjectDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreativeAssetsStore } from '@/stores/creative-assets-store'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { creativeAssetReferenceRoleLabel, creativeAssetStatusLabel, creativeAssetTypeLabel, creativeAssetVersionStatusLabel } from '@/lib/labels'
import { userErrorMessage } from '@/lib/user-error'

const REFERENCE_ROLES: Record<CreativeAssetType, CreativeAssetReferenceRole[]> = {
  character: ['front', 'three_quarter', 'side', 'back', 'full_body', 'medium', 'face_closeup'],
  environment: ['wide', 'medium', 'detail', 'other'],
  prop: ['isolated', 'detail', 'interaction', 'other'],
  style: ['style_board', 'other'],
}

export function CreativeAssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detail = useCreativeAssetsStore(state => (id ? state.details[id] : undefined))
  const loadDetail = useCreativeAssetsStore(state => state.loadDetail)
  const syncProjectMemberships = useCreativeAssetsStore(state => state.syncProjectMemberships)
  const projectQuery = useCreativeProjectsStore(state => state.queries[creativeProjectQueryKey()])
  const loadProjects = useCreativeProjectsStore(state => state.load)
  const showMessage = useNotificationsStore(state => state.showMessage)
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null)
  const [busyReferenceId, setBusyReferenceId] = useState<string | null>(null)
  const [referenceVersion, setReferenceVersion] = useState<CreativeAssetVersion | null>(null)
  const [addReferenceOpen, setAddReferenceOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [isSyncingProjects, setIsSyncingProjects] = useState(false)

  useEffect(() => {
    if (id) void loadDetail(id)
  }, [id, loadDetail])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  if (!id) return <DetailState title="缺少资产标识" description="请从资产重新打开一个资产。" />
  if (detail?.isLoading && detail.asset === null) return <DetailState title="正在加载资产详情" description="正在读取版本和引用关系。" loading />
  if (detail?.error && detail.asset === null) return <DetailState title="资产详情加载失败" description={detail.error} onRetry={() => void loadDetail(id, true)} />
  if (detail?.asset === null || detail === undefined) return <DetailState title="找不到这个资产" description="资产可能已经归档，或当前账号没有访问权限。" />

  const assetId = id
  const asset = detail.asset
  const projects: CreativeProject[] = projectQuery?.items ?? []
  const approvedVersion = asset.versions.find(version => version.id === asset.approvedVersionId)
  const previewVersion = approvedVersion ?? asset.versions[0]

  async function refresh() {
    await loadDetail(assetId, true)
  }

  async function transition(version: CreativeAssetVersion, status: 'candidate' | 'approved' | 'rejected') {
    if (busyVersionId !== null) return
    setBusyVersionId(version.id)
    try {
      await apiClient.transitionCreativeAssetVersion(version.id, { status })
      await refresh()
      showMessage({ title: status === 'approved' ? '版本已确认，可用于稳定引用' : status === 'candidate' ? '版本已进入确认队列' : '版本已驳回', tone: status === 'rejected' ? 'warning' : 'success' })
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
    } finally {
      setBusyVersionId(null)
    }
  }

  async function removeReference(reference: CreativeAssetReference) {
    if (!window.confirm(`移除「${creativeAssetReferenceRoleLabel(reference.role)}」参考图？`)) return
    if (busyReferenceId !== null) return
    setBusyReferenceId(reference.id)
    try {
      await apiClient.removeCreativeAssetReference(reference.assetVersionId, reference.id)
      await refresh()
      showMessage({ title: '参考图已从草稿版本移除', tone: 'info' })
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
    } finally {
      setBusyReferenceId(null)
    }
  }

  async function addReference(input: { userAssetId: string; role: CreativeAssetReferenceRole; position: number }) {
    if (referenceVersion === null) return
    try {
      await apiClient.addCreativeAssetReference(referenceVersion.id, {
        userAssetId: input.userAssetId,
        role: input.role,
        position: input.position,
        metadata: { source: 'uploaded' },
      })
      await refresh()
      setAddReferenceOpen(false)
      setReferenceVersion(null)
      showMessage({ title: '参考图已加入草稿版本', tone: 'success' })
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
    }
  }

  async function updateProjectMemberships(projectIds: string[]) {
    setIsSyncingProjects(true)
    try {
      await syncProjectMemberships(assetId, projectIds)
      showMessage({ title: '项目归属已更新', tone: 'success' })
    } catch (error) {
      showMessage({ title: userErrorMessage(error), tone: 'warning' })
      throw error
    } finally {
      setIsSyncingProjects(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assets')} title="返回资产"><ArrowLeft className="size-4" />返回资产</Button>
        <span aria-hidden="true">/</span>
        <span>{creativeAssetTypeLabel(asset.type)}</span>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">{asset.name}</span>
        {detail.isLoading && <Loader2 className="size-3.5 animate-spin" aria-label="正在更新" />}
      </div>

      <header className="flex flex-wrap items-end gap-4 border-b border-border/70 pb-5">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{asset.name}</h1>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">{creativeAssetStatusLabel(asset.status)}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{asset.description || '用版本保存主体、场景或道具的稳定参考，不把某一张图片误当成资产本身。'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`/create?creativeAssetId=${encodeURIComponent(asset.id)}`)} title="在生成页引用当前资产"><Sparkles className="size-4" />在生成页引用</Button>
          <Button onClick={() => navigate(`/create?creativeAssetId=${encodeURIComponent(asset.id)}`)} title="基于当前资产生成新版本">生成新版本</Button>
        </div>
      </header>

      <section aria-labelledby="creative-asset-projects-title" className="rounded-xl border border-border bg-card/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="creative-asset-projects-title" className="flex items-center gap-2 text-base font-semibold"><FolderKanban className="size-4 text-primary" aria-hidden="true" />所属项目</h2>
            <p className="mt-1 text-sm text-muted-foreground">一个资产可以被多个项目复用，项目归属不会改变资产版本。</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setProjectDialogOpen(true)} disabled={isSyncingProjects} title="管理当前资产所属的项目"><FolderKanban className="size-4" aria-hidden="true" />整理项目</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {asset.projects.length === 0 ? <span className="text-sm text-muted-foreground">暂未归入项目</span> : asset.projects.map(membership => {
            const project = projects.find(item => item.id === membership.projectId)
            const projectTitle = project?.title ?? `项目 ${membership.projectId.slice(0, 8)}`
            return <Link key={membership.id} to={`/projects/${encodeURIComponent(membership.projectId)}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`打开项目：${projectTitle}`}><FolderKanban className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{projectTitle}</span></Link>
          })}
          {projectQuery?.isLoading && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status"><Loader2 className="size-3 animate-spin" aria-hidden="true" />正在加载项目名称</span>}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <section className="relative min-h-[32rem] overflow-hidden rounded-xl border border-border bg-card">
          <PreviewPanel version={previewVersion} assetName={asset.name} />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-6 pt-20 text-white">
            <div>
              <p className="text-xs text-white/65">{approvedVersion ? '当前稳定版本' : '当前工作版本'}</p>
              <p className="mt-1 text-lg font-medium">{previewVersion ? `v${previewVersion.version} · ${creativeAssetVersionStatusLabel(previewVersion.status)}` : '还没有版本'}</p>
            </div>
            {approvedVersion && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-xs text-emerald-100"><CheckCircle2 className="size-3.5" />已确认，可引用</span>}
          </div>
        </section>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">版本审阅</CardTitle>
              <span className="text-xs text-muted-foreground">{asset.versions.length} 个版本</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {asset.versions.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">还没有版本。先上传参考图或从生成记录收录一个版本。</p> : asset.versions.map(version => (
                <VersionReviewCard
                  key={version.id}
                  version={version}
                  assetName={asset.name}
                  busy={busyVersionId === version.id}
                  onTransition={status => void transition(version, status)}
                  onAddReference={() => { setReferenceVersion(version); setAddReferenceOpen(true) }}
                  onRemoveReference={reference => void removeReference(reference)}
                  busyReferenceId={busyReferenceId}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">稳定引用说明</CardTitle>
              <span className="text-xs text-muted-foreground">给生成器的最小输入</span>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>只有“已确认”版本会进入生成编译层。每次生成会保存版本 ID 和具体参考图 ID，后续替换资产不会改变历史任务的含义。</p>
              <p>版本确认后不可直接改参考图；需要调整时建立新版本，保留旧版本用于复现。</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddReferenceDialog
        open={addReferenceOpen}
        version={referenceVersion}
        assetType={asset.type}
        onOpenChange={open => { setAddReferenceOpen(open); if (!open) setReferenceVersion(null) }}
        onSubmit={input => void addReference(input)}
      />
      <CreativeAssetProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        projects={projects}
        initialProjectIds={asset.projects.map(membership => membership.projectId)}
        isLoadingProjects={projectQuery?.isLoading ?? false}
        projectError={projectQuery?.error ?? null}
        onRetryProjects={() => void loadProjects({}, true)}
        onSubmit={updateProjectMemberships}
      />
    </div>
  )
}

function PreviewPanel({ version, assetName }: { version: CreativeAssetVersion | undefined; assetName: string }) {
  const reference = version?.references[0]
  const previewUrl = reference?.preview?.thumbnailUrl ?? reference?.preview?.url
  if (previewUrl !== undefined) return <img src={resolveApiUrl(previewUrl)} alt={`${assetName}预览`} className="absolute inset-0 size-full object-contain bg-muted/30" />
  return <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_70%_24%,rgb(228_107_120_/_0.25),transparent_44%),radial-gradient(circle_at_20%_82%,rgb(126_157_143_/_0.2),transparent_42%)]"><div className="text-center text-muted-foreground"><ImageIcon className="mx-auto size-10 opacity-60" /><p className="mt-3 text-sm">这个版本还没有可用预览</p></div></div>
}

function VersionReviewCard({
  version,
  assetName,
  busy,
  onTransition,
  onAddReference,
  onRemoveReference,
  busyReferenceId,
}: {
  version: CreativeAssetVersion
  assetName: string
  busy: boolean
  onTransition: (status: 'candidate' | 'approved' | 'rejected') => void
  onAddReference: () => void
  onRemoveReference: (reference: CreativeAssetReference) => void
  busyReferenceId: string | null
}) {
  const previewUrl = version.references[0]?.preview?.thumbnailUrl ?? version.references[0]?.preview?.url
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {previewUrl !== undefined ? <img src={resolveApiUrl(previewUrl)} alt={`${assetName} v${version.version}`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><ImageIcon className="size-5 text-muted-foreground" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">v{version.version}</span><StatusPill status={version.status} /></div>
          <p className="mt-1 text-xs text-muted-foreground">{version.references.length} 张参考图 · {new Date(version.updatedAt).toLocaleString('zh-CN')}</p>
          {version.sourceGenerationId && <p className="mt-1 truncate text-xs text-muted-foreground">来源生成：{version.sourceGenerationId}</p>}
        </div>
      </div>
      {version.references.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {version.references.map(reference => (
                <div key={reference.id} className="flex items-center gap-2 rounded-md border border-border/70 bg-background/50 p-2">
                  <ReferenceThumb reference={reference} />
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{creativeAssetReferenceRoleLabel(reference.role)} · 槽位 {reference.position + 1}</p><p className="truncate text-[11px] text-muted-foreground">{reference.userAssetId}</p></div>
                  {version.status === 'draft' && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`移除${creativeAssetReferenceRoleLabel(reference.role)}参考图`} title={`移除${creativeAssetReferenceRoleLabel(reference.role)}参考图`} onClick={() => onRemoveReference(reference)} disabled={busyReferenceId === reference.id}>{busyReferenceId === reference.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}</button>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {version.status === 'draft' && <><Button size="sm" variant="outline" onClick={onAddReference}><Plus className="size-3.5" />添加参考图</Button><Button size="sm" onClick={() => onTransition('candidate')} disabled={busy || version.references.length === 0}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}送入确认</Button></>}
        {version.status === 'candidate' && <><Button size="sm" onClick={() => onTransition('approved')} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}确认版本</Button><Button size="sm" variant="outline" onClick={() => onTransition('rejected')} disabled={busy}><X className="size-3.5" />驳回</Button></>}
        {version.status === 'approved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="size-3.5" />当前稳定版本</span>}
        {version.status === 'rejected' && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw className="size-3.5" />建立新版本重新确认</span>}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: CreativeAssetVersion['status'] }) {
  const color = status === 'approved' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : status === 'candidate' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : status === 'rejected' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-background text-muted-foreground'
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>{creativeAssetVersionStatusLabel(status)}</span>
}

function ReferenceThumb({ reference }: { reference: CreativeAssetReference }) {
  const previewUrl = reference.preview?.thumbnailUrl ?? reference.preview?.url
  return <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">{previewUrl ? <img src={resolveApiUrl(previewUrl)} alt={`${creativeAssetReferenceRoleLabel(reference.role)}参考图`} className="size-full object-cover" /> : <ImageIcon className="m-2 size-5 text-muted-foreground" aria-hidden="true" />}</div>
}

function AddReferenceDialog({
  open,
  version,
  assetType,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  version: CreativeAssetVersion | null
  assetType: CreativeAssetType
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { userAssetId: string; role: CreativeAssetReferenceRole; position: number }) => void
}) {
  const [role, setRole] = useState<CreativeAssetReferenceRole>(REFERENCE_ROLES[assetType][0] ?? 'other')
  const [position, setPosition] = useState('0')
  const [selected, setSelected] = useState<AssetItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRole(REFERENCE_ROLES[assetType][0] ?? 'other')
    setPosition(String(version?.references.length ?? 0))
    setSelected(null)
    setError(null)
  }, [assetType, open, version])

  const occupied = useMemo(() => new Set(version?.references.map(reference => `${reference.role}:${reference.position}`) ?? []), [version])

  function submit() {
    const numericPosition = Number(position)
    if (selected === null) return setError('请选择一张图片')
    if (!Number.isInteger(numericPosition) || numericPosition < 0) return setError('槽位必须是非负整数')
    if (occupied.has(`${role}:${numericPosition}`)) return setError('这个角色和槽位已经被占用')
    onSubmit({ userAssetId: selected.id, role, position: numericPosition })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>添加参考图</DialogTitle><DialogDescription>只修改当前草稿版本；版本进入确认队列后，参考图槽位会被冻结。</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div className="space-y-2"><Label htmlFor="reference-role">参考图角色</Label><Select value={role} onValueChange={value => setRole(value as CreativeAssetReferenceRole)}><SelectTrigger id="reference-role" title="选择参考图角色"><SelectValue /></SelectTrigger><SelectContent>{REFERENCE_ROLES[assetType].map(item => <SelectItem key={item} value={item}>{creativeAssetReferenceRoleLabel(item)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="reference-position">槽位</Label><Input id="reference-position" title="设置参考图槽位" type="number" min={0} step={1} value={position} onChange={event => setPosition(event.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>图片</Label>{selected ? <div className="flex items-center gap-3 rounded-lg border p-2"><div className="size-10 shrink-0 overflow-hidden rounded bg-muted"><img src={resolveApiUrl(selected.thumbnailUrl ?? selected.url)} alt={selected.fileName ?? '已选择参考图'} className="size-full object-cover" /></div><span className="min-w-0 flex-1 truncate text-sm">{selected.fileName ?? selected.id}</span><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)} title="更换已选择的参考图">更换</Button></div> : <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)} title="从资产库选择参考图"><Plus className="size-4" />从资产库选择图片</Button>}</div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} title="取消添加参考图">取消</Button><Button onClick={submit} disabled={selected === null} title="将参考图加入当前草稿版本">加入草稿版本</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AssetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} mediaKind="image" multiple={false} onSelect={assets => setSelected(assets[0] ?? null)} />
    </>
  )
}

function DetailState({ title, description, loading = false, onRetry }: { title: string; description: string; loading?: boolean; onRetry?: () => void }) {
  return <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><div className="flex size-12 items-center justify-center rounded-xl bg-muted/70 text-primary">{loading ? <Layers3 className="size-5 animate-pulse" /> : <ImageIcon className="size-5" />}</div><h1 className="text-base font-semibold">{title}</h1><p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{onRetry && <Button variant="outline" onClick={onRetry}>重新加载</Button>}</div>
}
