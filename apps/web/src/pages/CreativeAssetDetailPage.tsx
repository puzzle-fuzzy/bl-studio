import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, Image, Layers3, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { creativeAssetTypeLabel, creativeAssetVersionStatusLabel } from '@/lib/labels'
import { useCreativeAssetsStore } from '@/stores/creative-assets-store'

export function CreativeAssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detail = useCreativeAssetsStore(state => (id ? state.details[id] : undefined))
  const loadDetail = useCreativeAssetsStore(state => state.loadDetail)

  useEffect(() => {
    if (id) void loadDetail(id)
  }, [id, loadDetail])

  if (!id) return <DetailState title="缺少素材标识" description="请从素材库重新打开一个素材。" />
  if (detail?.isLoading && detail.asset === null) return <DetailState title="正在加载素材详情" description="正在读取版本和引用关系。" loading />
  if (detail?.error && detail.asset === null) return <DetailState title="素材详情加载失败" description={detail.error} onRetry={() => void loadDetail(id, true)} />
  if (detail?.asset === null || detail === undefined) return <DetailState title="找不到这个素材" description="素材可能已经归档，或当前账号没有访问权限。" />

  const asset = detail.asset
  const approvedVersion = asset.versions.find(version => version.id === asset.approvedVersionId)

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assets')}><ArrowLeft className="size-4" />返回素材库</Button>
        <span aria-hidden="true">/</span>
        <span>{creativeAssetTypeLabel(asset.type)}</span>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">{asset.name}</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="relative flex min-h-[30rem] items-end overflow-hidden rounded-xl border border-border bg-card p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgb(228_107_120_/_0.25),transparent_44%),radial-gradient(circle_at_20%_82%,rgb(126_157_143_/_0.2),transparent_42%)]" />
          <div className="relative z-10"><p className="text-xs text-muted-foreground">当前资产实体</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{asset.name}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{asset.description || '暂无描述。创建版本后，参考图和生成记录会显示在这里。'}</p></div>
        </section>
        <aside className="space-y-3">
          <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers3 className="size-5" /></div><div className="min-w-0"><h2 className="font-semibold">{asset.name}</h2><p className="mt-1 text-sm text-muted-foreground">{creativeAssetTypeLabel(asset.type)} · {asset.status === 'active' ? '活跃' : asset.status === 'archived' ? '已归档' : '草稿'}</p></div></div><div className="mt-5 flex gap-2"><Button onClick={() => navigate(`/create?assetId=${encodeURIComponent(asset.id)}`)}><Sparkles className="size-4" />生成新版本</Button><Button variant="outline" disabled>编辑资产</Button></div></section>
          <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">版本</h2><span className="text-xs text-muted-foreground">{asset.versions.length} 个版本</span></div><div className="mt-3 space-y-2">{asset.versions.map(version => <div key={version.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"><span className="flex items-center gap-2"><span className="font-medium">v{version.version}</span>{version.id === asset.approvedVersionId && <CheckCircle2 className="size-4 text-emerald-400" aria-label="已确认版本" />}</span><span className={`rounded-full border px-2 py-0.5 text-xs ${version.status === 'approved' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-border text-muted-foreground'}`}>{creativeAssetVersionStatusLabel(version.status)}</span></div>)}</div></section>
          <section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">参考图</h2>{approvedVersion?.references.length ? <div className="mt-3 grid grid-cols-2 gap-2">{approvedVersion.references.map(reference => <div key={reference.id} className="rounded-lg border border-border bg-muted/30 p-3"><div className="flex items-center gap-2 text-sm"><Image className="size-4 text-primary" /><span>{reference.role}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{reference.userAssetId}</p></div>)}</div> : <p className="mt-2 text-sm leading-6 text-muted-foreground">当前还没有已确认版本的参考图。完成版本确认后，引用关系会在这里展示。</p>}</section>
        </aside>
      </div>
      <Link to="/assets" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">返回素材库继续整理</Link>
    </div>
  )
}

function DetailState({ title, description, loading = false, onRetry }: { title: string; description: string; loading?: boolean; onRetry?: () => void }) {
  return <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><div className="flex size-12 items-center justify-center rounded-xl bg-muted/70 text-primary">{loading ? <Layers3 className="size-5 animate-pulse" /> : <Image className="size-5" />}</div><h1 className="text-base font-semibold">{title}</h1><p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{onRetry && <Button variant="outline" onClick={onRetry}>重新加载</Button>}</div>
}
