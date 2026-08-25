import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Ban, Bookmark, BookmarkCheck, Check, ChevronDown, CircleAlert, Copy, Download, Eye, Loader2, Share2, RotateCcw, Wand2 } from 'lucide-react'
import { MediaLightbox, isLightboxKind, type LightboxMedia } from '@/components/shared/MediaLightbox'
import { CollectGenerationAssetDialog } from '@/components/assets/CollectGenerationAssetDialog'
import type { AssetItem, GenerationArtifact, GenerationDiagnostics, GenerationRecord } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { PromptSegments } from '@/components/generations/PromptSegments'
import { useGenerationArtifactsStore } from '@/stores/generation-artifacts-store'
import { useGenerationsStore } from '@/stores/generations-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { useReferenceAssetsStore } from '@/stores/reference-assets-store'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { describeGenerationFailure } from '@/lib/generation-failure'
import { formatCents } from '@/lib/money'
import { resolveApiUrl } from '@/lib/api'
import { parsePromptReferences, referenceFormatOf, restorePromptReferences } from '@/lib/reference-format'
import { generationMirrorAssetId, pickImageEditModel, supportsUpscaleSize } from '@/lib/edit-model'
import { encodeDeepLinkParams } from '@/lib/deeplink-params'
import { ACTIVE_GENERATION_STATUSES, generationStatusLabel, kindLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** 生成详情页：成品 + 输入参数 + 操作（取消/重跑/分享/移除）+ 诊断。 */
export function GenerationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showMessage = useNotificationsStore(state => state.showMessage)
  const refreshRecord = useGenerationsStore(state => state.refreshRecord)
  // P1-04：详情页记录跟随 store —— SSE/降级轮询把最新 record 合并进 store.records 后，
  // 这里取到的对象引用随之更新，页面开着也能看到 queued→succeeded 全过程。
  const storeRecord = useGenerationsStore(state =>
    id !== undefined ? state.records.find(candidate => candidate.id === id) ?? null : null,
  )
  const [record, setRecord] = useState<GenerationRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id === undefined) return
    setIsLoading(true)
    setError(null)
    setRecord(null)
    apiClient
      .getGeneration(id)
      .then(setRecord)
      .catch(err => setError(userErrorMessage(err)))
      .finally(() => setIsLoading(false))
  }, [id])

  // 从 store 同步最新状态到本地渲染；无对应记录（如 store 被视图切换清空）时保持本地值。
  useEffect(() => {
    if (storeRecord !== null) setRecord(storeRecord)
  }, [storeRecord])

  if (isLoading && record === null) {
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
  const [visibility, setVisibility] = useState<'private' | 'public'>(record.visibility ?? 'private')
  const [favorited, setFavorited] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)

  // 加载收藏状态（仅本人可见的作品；详情页记录通常对 owner 可见）。
  useEffect(() => {
    let cancelled = false
    apiClient
      .getGenerationFavorite(id)
      .then(result => { if (!cancelled) setFavorited(result.favorited) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [id])

  // 复用共享活跃态集合，避免与 labels.ts 重复手写（P2-26）。
  const isActive = ACTIVE_GENERATION_STATUSES.has(record.status)

  const handleVisibilityToggle = async () => {
    const next: 'private' | 'public' = visibility === 'private' ? 'public' : 'private'
    if (next === 'public') {
      const ok = window.confirm('公开后，所有同事都能在社区画廊看到该作品及其提示词。确定公开吗？')
      if (!ok) return
    }
    setBusy(true)
    try {
      const result = await apiClient.setGenerationVisibility(id, next)
      setVisibility(result.visibility)
      onRefreshed({ ...record, visibility: result.visibility })
      showMessage({ title: result.visibility === 'public' ? '已公开到社区' : '已设为私密', tone: 'info' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const handleFavoriteToggle = async () => {
    setFavoriteBusy(true)
    try {
      const next = !favorited
      if (next) {
        await apiClient.favoriteGeneration(id)
      } else {
        await apiClient.unfavoriteGeneration(id)
      }
      setFavorited(next)
      showMessage({ title: next ? '已收藏' : '已取消收藏', tone: 'info' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setFavoriteBusy(false)
    }
  }

  const handleSavePrompt = async () => {
    setBusy(true)
    try {
      // P1-06：落库前把 provider 语法（`<<<image_1>>>`）反解析回中性 `@图N` 标记，
      // 复用时编辑器按标记渲染参考图 chip，而不是显示语法原文。
      const models = useModelCatalogStore.getState().models
      const format = referenceFormatOf(selectModelById(models, record.modelId))
      const rawPrompt = typeof record.inputParams.prompt === 'string' ? record.inputParams.prompt : ''
      const prompt = restorePromptReferences(rawPrompt, format)
      await apiClient.createPromptLibraryItem({
        name: `${record.modelId} 作品`,
        modelId: record.modelId,
        prompt: prompt.length > 0 ? prompt : '（空提示词）',
        params: record.inputParams,
      })
      showMessage({ title: '已保存到提示词库', tone: 'success' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

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

  const handleLibraryState = async (state: 'hidden' | 'deleted' | 'visible') => {
    try {
      const next = await apiClient.setGenerationLibraryState(id, state)
      onRefreshed(next)
      showMessage({ title: state === 'hidden' ? '已隐藏' : state === 'deleted' ? '已移除' : '已恢复', tone: 'info' })
    } catch (err) {
      showMessage({ title: userErrorMessage(err), tone: 'warning' })
    }
  }

  // R2-P1-05：隐藏/移除后的任务在详情页提供「恢复」，找回动作可逆。
  const isInTrash = record.hiddenAt !== null || record.deletedAt !== null

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
          {record.status === 'succeeded' && (
            <Button variant="outline" size="sm" onClick={() => setCollectOpen(true)} disabled={busy}>
              收录为创意资产
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={favoriteBusy}
            onClick={() => void handleFavoriteToggle()}
            aria-label={favorited ? '取消收藏' : '收藏'}
          >
            {favorited ? <BookmarkCheck data-icon className="text-primary" /> : <Bookmark data-icon />}
            {favorited ? '已收藏' : '收藏'}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleSavePrompt()}>
            保存为提示词
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || record.status !== 'succeeded'}
            onClick={() => void handleVisibilityToggle()}
            className={visibility === 'public' ? 'text-primary' : undefined}
          >
            {visibility === 'public' ? '取消公开' : '公开到社区'}
          </Button>
          {isInTrash ? (
            <Button variant="ghost" size="sm" onClick={() => void handleLibraryState('visible')}>
              <RotateCcw data-icon />
              恢复
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => void handleLibraryState('hidden')}>
                隐藏
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void handleLibraryState('deleted')}>
                移除
              </Button>
            </>
          )}
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

      {record.status === 'failed' && (
        <FailureDetailPanel record={record} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ArtifactsSection recordId={id} />
        <div className="space-y-6">
          <ParamsCard record={record} />
          <InfoCard record={record} />
        </div>
      </div>

      <DiagnosticsSection recordId={id} />

      <CollectGenerationAssetDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        generationId={id}
        onCreated={asset => {
          setCollectOpen(false)
          showMessage({ title: '已建立待确认创意资产版本', tone: 'success' })
          navigate(`/assets/${encodeURIComponent(asset.id)}`)
        }}
      />
    </div>
  )
}

/** 失败详情面板：展示 provider 错误原文 + 错误码/分类/是否可重试等排障信息。 */
function FailureDetailPanel({ record }: { record: GenerationRecord }) {
  const failure = describeGenerationFailure(record)
  const hasError = failure.message !== undefined
    || failure.statusReason !== undefined
    || failure.code !== undefined
    || failure.category !== undefined
    || failure.retriable !== undefined
    || failure.details !== undefined
  if (!hasError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        生成失败，未返回详细原因，可点击重试。
      </p>
    )
  }

  const hasMetadata = failure.code !== undefined
    || failure.category !== undefined
    || failure.retriable !== undefined

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CircleAlert data-icon className="h-4 w-4 text-destructive" />
          失败原因
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {failure.message !== undefined && (
          <p className="text-destructive">{failure.message}</p>
        )}
        {failure.statusReason !== undefined && (
          <p className="text-muted-foreground">{failure.statusReason}</p>
        )}
        {failure.details !== undefined && Object.keys(failure.details).length > 0 && (
          <pre className="max-h-48 overflow-auto rounded-md border bg-background/80 p-2 font-mono text-xs text-muted-foreground">
            {JSON.stringify(failure.details, null, 2)}
          </pre>
        )}
        {hasMetadata && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            {failure.code !== undefined && (
              <>
                <dt>code</dt>
                <dd>{failure.code}</dd>
              </>
            )}
            {failure.category !== undefined && (
              <>
                <dt>category</dt>
                <dd>{failure.category}</dd>
              </>
            )}
            {failure.retriable !== undefined && (
              <>
                <dt>retriable</dt>
                <dd>{failure.retriable ? '是' : '否'}</dd>
              </>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
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
          downloadUrl={lightboxItems[previewIndex]?.url !== undefined
            ? resolveApiUrl(lightboxItems[previewIndex]?.url ?? '')
            : undefined}
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
  const navigate = useNavigate()
  const models = useModelCatalogStore(state => state.models)
  const src = artifact.readUrl ?? artifact.storageUrl ?? artifact.sourceUrl
  if (artifact.kind === 'text') {
    return (
      <div className="rounded-lg border p-3">
        <p className="line-clamp-6 whitespace-pre-wrap text-sm">{artifact.text ?? '(空文本)'}</p>
      </div>
    )
  }
  // 生成产物会镜像成 user_asset（id = asset_generation_<artifact>），可作编辑/参考图输入。
  const assetId = generationMirrorAssetId(artifact.id)
  // P1-12：编辑目标模型按 capabilities 从目录派生，而非硬编码 qwen-image-edit。
  const editModel = pickImageEditModel(models)
  const upscaleAvailable = supportsUpscaleSize(editModel)
  const upscaleParams = encodeDeepLinkParams({ prompt: '高清重绘放大', size: '2048*2048' })
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
      {src !== undefined && (
        <a
          href={resolveApiUrl(src)}
          download
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/80 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="下载"
          title="下载"
        >
          <Download className="size-3.5" />
        </a>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-md bg-background/80 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="以图继续创作"
          >
            <Wand2 className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>以图继续创作</DropdownMenuLabel>
          {editModel !== undefined ? (
            <>
              <DropdownMenuItem onClick={() => navigate(`/create?select=${editModel.id}&edit=${assetId}`)}>
                图像编辑（重绘/换背景/增删物体）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/create?ref=${assetId}`)}>
                用作参考图生成变体
              </DropdownMenuItem>
              {upscaleAvailable && (
                <DropdownMenuItem onClick={() => navigate(`/create?select=${editModel.id}&edit=${assetId}&params=${upscaleParams}`)}>
                  放大（{editModel.displayName} 重绘到 2048×2048）
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <DropdownMenuItem onClick={() => navigate(`/create?ref=${assetId}`)}>
              用作参考图生成变体
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// P1-14：record.assetRefs/inputParams 缺省时的稳定空值。`?? {}` 每次渲染产生新对象，
// 会经 refIds memo → effect 依赖造成「每渲染重跑 loadModels/getRefAssets」。
const EMPTY_ASSET_REFS: Record<string, string[]> = {}
const EMPTY_INPUT_PARAMS: Record<string, unknown> = {}

function ParamsCard({ record }: { record: GenerationRecord }) {
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const refAssets = useReferenceAssetsStore(state => state.assets)
  const getRefAssets = useReferenceAssetsStore(state => state.getAssets)

  const model = selectModelById(models, record.modelId)
  const format = model?.referenceFormat
  const assetRefs = record.assetRefs ?? EMPTY_ASSET_REFS
  const inputParams = record.inputParams ?? EMPTY_INPUT_PARAMS

  // 英文参数名 → manifest 中文 label；未命中的回退显示原 key。
  const labelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const parameter of model?.parameters ?? []) map.set(parameter.name, parameter.label)
    return map
  }, [model])

  // assetRefs → 全部资产 id，拉取到共享参考资产缓存。
  const refIds = useMemo(() => {
    const ids: string[] = []
    for (const list of Object.values(assetRefs)) ids.push(...list)
    return ids
  }, [assetRefs])

  useEffect(() => {
    void loadModels()
    if (refIds.length > 0) void getRefAssets(refIds)
  }, [loadModels, getRefAssets, refIds])

  // 提示词标记 → 被引用的参考图序号（references 池下标 N-1）。已内联引用的池条目
  // 不再单独重复展示（与任务列表一致）。
  const prompt = typeof inputParams.prompt === 'string' ? inputParams.prompt : ''
  const referencedIndexes = useMemo(
    () =>
      new Set(
        parsePromptReferences(prompt, format).flatMap(segment =>
          segment.type === 'image' ? [segment.index ?? -1] : [],
        ),
      ),
    [prompt, format],
  )

  // 行列表：media 参数（assetRefs）渲染缩略图，其余渲染值；prompt 带内联参考图缩略图。
  const rows = useMemo(() => {
    const rows: Array<{ key: string; label: string; kind: 'media' | 'value'; value?: unknown; refIds?: readonly string[] }> = []
    const shownKeys = new Set<string>()
    const shownMediaKeys = new Set<string>()

    const shownPoolIds = (ids: readonly string[]): string[] =>
      ids.filter((_, position) => !referencedIndexes.has(position + 1))

    for (const parameter of model?.parameters ?? []) {
      if (parameter.type === 'media') {
        const ids = assetRefs[parameter.name] ?? []
        const shown = parameter.name === 'references' ? shownPoolIds(ids) : ids
        if (shown.length > 0) {
          shownMediaKeys.add(parameter.name)
          rows.push({ key: parameter.name, label: parameter.label, kind: 'media', refIds: shown })
        }
      } else {
        const value = inputParams[parameter.name]
        if (value !== undefined) {
          shownKeys.add(parameter.name)
          rows.push({ key: parameter.name, label: parameter.label, kind: 'value', value })
        }
      }
    }
    // 不在目录（历史记录）或目录外的参数：按输入顺序补全。
    for (const [key, value] of Object.entries(inputParams)) {
      if (key.startsWith('_') || shownKeys.has(key) || shownMediaKeys.has(key)) continue
      rows.push({ key, label: labelMap.get(key) ?? key, kind: 'value', value })
    }
    for (const [key, ids] of Object.entries(assetRefs)) {
      if (shownMediaKeys.has(key)) continue
      if (!Array.isArray(ids) || ids.length === 0) continue
      const shown = key === 'references' ? shownPoolIds(ids) : ids
      if (shown.length === 0) continue
      rows.push({ key, label: labelMap.get(key) ?? key, kind: 'media', refIds: shown })
    }
    return rows
  }, [model, inputParams, assetRefs, labelMap, referencedIndexes])

  const referencesPool = assetRefs.references ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">输入参数</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">无参数</p>
        ) : (
          rows.map(row => (
            <div key={row.key} className="grid grid-cols-[96px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="min-w-0 wrap-break-word">
                {row.kind === 'media' ? (
                  <RefThumbnails ids={row.refIds ?? []} refAssets={refAssets} />
                ) : row.key === 'prompt' && typeof row.value === 'string' && row.value !== '' ? (
                  <PromptSegments prompt={row.value} format={format} pool={referencesPool} refAssets={refAssets} />
                ) : (
                  renderParamValue(row.value)
                )}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

/** 参考图缩略图行：按 assetRefs 顺序展示，资产未就绪时先占位。 */
function RefThumbnails({
  ids,
  refAssets,
}: {
  ids: readonly string[]
  refAssets: Record<string, AssetItem>
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map(id => {
        const asset = refAssets[id]
        const src = asset?.thumbnailUrl ?? asset?.url
        return src !== undefined ? (
          <div
            key={id}
            title={asset?.fileName ?? asset?.kind}
            className="size-10 shrink-0 overflow-hidden rounded border bg-muted/30"
          >
            <AssetThumbnail kind={asset?.kind ?? 'image'} url={src} />
          </div>
        ) : (
          <div key={id} className="size-10 shrink-0 animate-pulse rounded border bg-muted/30" />
        )
      })}
    </div>
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
  const rows: Array<{ key: string; value: string; copyable?: boolean }> = [
    { key: '状态', value: generationStatusLabel(record.status) },
    { key: '模型', value: record.modelId },
    { key: '任务模式', value: record.providerModel },
    { key: '费用预估', value: formatCents(record.costEstimate) },
    { key: '创建时间', value: new Date(record.createdAt).toLocaleString('zh-CN') },
    { key: '幂等键', value: record.idempotencyKey ?? '—', copyable: true },
    { key: 'provider 任务', value: record.providerTaskId ?? '—', copyable: true },
    { key: '请求 id', value: record.requestId ?? '—', copyable: true },
    { key: 'traceId', value: record.traceId ?? '—', copyable: true },
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
        {rows.map(row => (
          <div key={row.key} className="grid grid-cols-[96px_1fr] gap-2 text-sm">
            <span className="text-muted-foreground">{row.key}</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate" title={row.value}>
                {row.value}
              </span>
              {row.copyable === true && row.value !== '—' && row.value !== '' && (
                <CopyValue value={row.value} label={row.key} />
              )}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** 运行信息里的调试标识（幂等键/traceId 等）：一键复制，短暂显示对勾。 */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`复制${label}`}
      title={`复制${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  )
}
