import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown, Copy, Eye, ExternalLink, Loader2, Share2, RotateCcw, Ban } from 'lucide-react'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import type { GenerationArtifact, GenerationDiagnostics, GenerationRecord } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { useGenerationArtifactsStore } from '@/stores/generation-artifacts-store'
import { useGenerationsStore } from '@/stores/generations-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { formatCents } from '@/lib/money'
import { resolveApiUrl } from '@/lib/api'
import { generationStatusLabel, kindLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** 生成详情页：成品 + 输入参数 + 操作（取消/重跑/分享/移除）+ 诊断。 */
export function GenerationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showMessage = useNotificationsStore(state => state.showMessage)
  const refreshRecord = useGenerationsStore(state => state.refreshRecord)
  const [record, setRecord] = useState<GenerationRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id === undefined) return
    setIsLoading(true)
    setError(null)
    apiClient
      .getGeneration(id)
      .then(setRecord)
      .catch(err => setError(userErrorMessage(err)))
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
  }
  if (error !== null || record === null) {
    return (
      <div className="space-y-3 py-16 text-center">
        <p className="text-sm text-destructive">{error ?? '记录不存在'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/generations')}>
          <ArrowLeft data-icon />
          返回任务列表
        </Button>
      </div>
    )
  }

  return <DetailContent record={record} onRefreshed={setRecord} refreshRecord={refreshRecord} showMessage={showMessage} />
}

function DetailContent({
  record,
  onRefreshed,
  refreshRecord,
  showMessage,
}: {
  record: GenerationRecord
  onRefreshed: (record: GenerationRecord) => void
  refreshRecord: (id: string) => Promise<void>
  showMessage: (message: { title: string; tone: 'success' | 'warning' | 'info' }) => void
}) {
  const navigate = useNavigate()
  const id = record.id
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isActive = ['draft', 'submitting', 'processing', 'provider_processing', 'saving_output'].includes(record.status)

  const handleCancel = async () => {
    setBusy(true)
    try {
      const next = await apiClient.cancelGeneration(id)
      onRefreshed(next.record)
      void refreshRecord(id)
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const handleRerun = async () => {
    setBusy(true)
    try {
      const result = await apiClient.retryGeneration(id)
      navigate(`/generations/${result.record.id}`)
      void refreshRecord(id)
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const handleShare = async () => {
    setBusy(true)
    try {
      const result = await apiClient.createGenerationShare(id, { includeParams: true })
      const url = `${window.location.origin}/share/generations/${result.share.id}`
      setShareUrl(url)
      await navigator.clipboard?.writeText(url).catch(() => undefined)
      showMessage({ title: '分享链接已生成并复制', tone: 'success' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const handleLibraryState = async (state: 'hidden' | 'deleted') => {
    try {
      const next = await apiClient.setGenerationLibraryState(id, state)
      onRefreshed(next)
      showMessage({ title: state === 'hidden' ? '已隐藏' : '已移除', tone: 'info' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft data-icon />
          返回
        </Button>
        <StatusBadge status={record.status} />
        <span className="text-sm text-muted-foreground">{record.modelId}</span>
        <span className="text-sm text-muted-foreground">{formatCents(record.costEstimate)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {isActive && (
            <Button variant="outline" size="sm" onClick={() => void handleCancel()} disabled={busy}>
              <Ban data-icon />
              取消
            </Button>
          )}
          {record.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={() => void handleRerun()} disabled={busy}>
              <RotateCcw data-icon />
              重试
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleShare()} disabled={busy}>
            <Share2 data-icon />
            分享
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/create?reuse=${id}`)}>
            用同参数新建
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleLibraryState('hidden')}>
            隐藏
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void handleLibraryState('deleted')}>
            移除
          </Button>
        </div>
      </div>

      {shareUrl !== null && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-2 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{shareUrl}</span>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>
              <Copy data-icon />
              复制
            </Button>
          </CardContent>
        </Card>
      )}

      {record.status === 'failed' && record.errorJson !== undefined && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {typeof record.errorJson === 'string' ? record.errorJson : '生成失败，可点击重试'}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ArtifactsSection recordId={id} />
        <div className="space-y-6">
          <ParamsCard record={record} />
          <InfoCard record={record} />
        </div>
      </div>

      <DiagnosticsSection recordId={id} />
    </div>
  )
}

function DiagnosticsSection({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || diagnostics !== null) return
    setIsLoading(true)
    setError(null)
    apiClient
      .getGenerationDiagnostics(recordId)
      .then(setDiagnostics)
      .catch(err => setError(userErrorMessage(err)))
      .finally(() => setIsLoading(false))
  }, [open, recordId, diagnostics])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Eye className="size-4" />
                链路诊断
              </CardTitle>
              <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {isLoading && (
              <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                加载中…
              </p>
            )}
            {error !== null && <p className="text-sm text-destructive">{error}</p>}
            {diagnostics !== null && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <InfoRow label="总耗时" value={diagnostics.generationDurationMs !== undefined ? `${diagnostics.generationDurationMs}ms` : '—'} />
                  <InfoRow label="traceId" value={diagnostics.traceId ?? '—'} />
                  <InfoRow label="任务阶段" value={`${diagnostics.tasks.length} 个`} />
                </div>
                {diagnostics.tasks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">任务阶段</p>
                    <ScrollArea className="max-h-48">
                      {diagnostics.tasks.map((task, index) => (
                        <div key={index} className="grid grid-cols-[120px_1fr] gap-2 border-b py-1 text-xs last:border-0">
                          <span className="text-muted-foreground">{task.type}</span>
                          <span className="truncate">{task.status}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
                {diagnostics.providerRequests.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">provider 请求</p>
                    <ScrollArea className="max-h-48">
                      {diagnostics.providerRequests.map((request, index) => (
                        <div key={index} className="grid grid-cols-[120px_1fr_80px] gap-2 border-b py-1 text-xs last:border-0">
                          <span className="text-muted-foreground">{request.operation}</span>
                          <span className="truncate">{request.status}</span>
                          <span className="text-right">{request.latencyMs !== undefined ? `${request.latencyMs}ms` : '—'}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate" title={value}>
        {value}
      </span>
    </div>
  )
}

function ArtifactsSection({ recordId }: { recordId: string }) {
  const entry = useGenerationArtifactsStore(state => state.entries[recordId])
  const load = useGenerationArtifactsStore(state => state.load)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    void load(recordId)
  }, [recordId, load])

  const items = entry?.items ?? []

  const lightboxItems: LightboxMedia[] = items.map(artifact => ({
    key: artifact.id,
    kind: isLightboxKind(artifact.kind) ? artifact.kind : 'image',
    url: artifact.readUrl ?? artifact.storageUrl ?? artifact.sourceUrl,
    thumbnailUrl: artifact.thumbnailUrl,
    fileName: `${kindLabel(artifact.kind)}产物`,
    text: artifact.text,
  }))

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">生成产物</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {entry?.isLoading ? '加载中…' : '暂无产物'}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((artifact, index) => (
                <ArtifactCard key={artifact.id} artifact={artifact} onPreview={() => setPreviewIndex(index)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {previewIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  )
}

function ArtifactCard({
  artifact,
  onPreview,
}: {
  artifact: GenerationArtifact
  onPreview: () => void
}) {
  const src = artifact.readUrl ?? artifact.storageUrl ?? artifact.sourceUrl
  if (artifact.kind === 'text') {
    return (
      <div className="rounded-lg border p-3">
        <p className="line-clamp-6 whitespace-pre-wrap text-sm">{artifact.text ?? '(空文本)'}</p>
      </div>
    )
  }
  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg border">
      {src !== undefined && artifact.kind === 'image' ? (
        <button
          type="button"
          className="block size-full cursor-zoom-in"
          aria-label="全屏查看"
          onClick={onPreview}
        >
          <img src={resolveApiUrl(src)} alt="" className="size-full object-cover" loading="lazy" />
        </button>
      ) : src !== undefined ? (
        <button
          type="button"
          className="block size-full cursor-zoom-in"
          aria-label="全屏播放"
          onClick={onPreview}
        >
          <video src={resolveApiUrl(src)} className="size-full object-cover" muted playsInline preload="metadata" />
        </button>
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">暂无文件</div>
      )}
      <a
        href={resolveApiUrl(src ?? '')}
        target="_blank"
        rel="noreferrer"
        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/80 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="在新窗口打开"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}

function ParamsCard({ record }: { record: GenerationRecord }) {
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const params = useMemo(() => {
    return Object.entries(record.inputParams ?? {}).filter(([key]) => !key.startsWith('_'))
  }, [record.inputParams])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  // 英文参数名 → manifest 中文 label；未命中的回退显示原 key。
  const model = selectModelById(models, record.modelId)
  const labelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const parameter of model?.parameters ?? []) map.set(parameter.name, parameter.label)
    return map
  }, [model])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">输入参数</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {params.length === 0 ? (
          <p className="text-sm text-muted-foreground">无参数</p>
        ) : (
          params.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[96px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">{labelMap.get(key) ?? key}</span>
              <span className="min-w-0 break-words">{renderParamValue(value)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function renderParamValue(value: unknown): React.ReactNode {
  if (Array.isArray(value)) {
    return value.length === 0 ? '(空)' : value.map((item, index) => <span key={index}>{renderParamValue(item)}</span>)
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (typeof record.url === 'string') {
      return <AssetThumbnail kind={typeof record.kind === 'string' ? record.kind : 'image'} url={record.url as string} className="size-10" />
    }
    return <pre className="text-xs">{JSON.stringify(value)}</pre>
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined) return '(空)'
  return String(value)
}

function InfoCard({ record }: { record: GenerationRecord }) {
  const rows: Array<[string, string]> = [
    ['状态', generationStatusLabel(record.status)],
    ['模型', record.modelId],
    ['任务模式', record.providerModel],
    ['费用预估', formatCents(record.costEstimate)],
    ['创建时间', new Date(record.createdAt).toLocaleString('zh-CN')],
    ['幂等键', record.idempotencyKey ?? '—'],
    ['provider 任务', record.providerTaskId ?? '—'],
    ['请求 id', record.requestId ?? '—'],
    ['traceId', record.traceId ?? '—'],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Eye className="size-4" />
          运行信息
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[96px_1fr] gap-2 text-sm">
            <span className="text-muted-foreground">{key}</span>
            <span className="min-w-0 truncate" title={value}>
              {value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
