/**
 * 导演台各阶段审核/展示组件（从 DirectorProjectPage 3144 行巨型文件中提取）。
 *
 * 本文件只包含纯展示/审核组件——不持有服务端状态（页面级 useState 已在
 * DirectorProjectPage 中统一管理），通过 props 接收全部数据与回调。
 */

import type { DIRECTOR_PHASES } from '@bailian-studio/api-client'
import type { AssetItem, DirectorAnalysisResult, DirectorAsset, DirectorCharactersResult, DirectorContinuityResult, DirectorDialogueResult, DirectorLocationsResult, DirectorProjectDetail, DirectorPromptRebuildResult, DirectorScriptMessage, DirectorScriptVersionSummary, DirectorShot, ModelCatalogItem, UpdateDirectorShotInput } from '@bailian-studio/api-client'
import { DIRECTOR_PHASE_LABELS } from '@bailian-studio/api-client'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { cn, resolveApiUrl } from '@bailian-studio/lib-client'
import { modelNameZh } from '@/lib/model-modes'
import { ScreenplayDocument } from './ScreenplayDocument'
import { Badge, Button, Textarea, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Input, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Separator } from '@bailian-studio/ui'
import { Check, CircleDashed, Download, FileText, History, Loader2, LockKeyhole, MessageCircle, Plus, Send, Sparkles, Trash2, Video } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEffect, useState } from 'react'



type ReferenceOwnerType = 'character' | 'location'
type ReferenceTarget = { ownerType: ReferenceOwnerType; ownerId: string }
type ScriptMessageDeliveryStatus = 'pending' | 'sent' | 'failed' | 'queued'
type ScriptMessageView = DirectorScriptMessage & { deliveryStatus?: ScriptMessageDeliveryStatus }

export function DirectorContinuityReview({ result, rawText, stale = false }: { result?: DirectorContinuityResult; rawText?: string; stale?: boolean }) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">连续性结论</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">等待执行结果</span>}
        </div>
        {rawText !== undefined && <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>}
        {rawText === undefined && <p className="text-sm leading-7 text-muted-foreground">执行连续性检查后，这里会显示结构化风险和修正建议。</p>}
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">连续性结论</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">{result.issues.length} 条建议</Badge>
        </div>
      </div>
      <p className="text-sm leading-7">{result.summary}</p>
      {result.issues.length === 0 ? (
        <p className="text-sm leading-7 text-muted-foreground">暂未发现需要人工处理的连续性问题。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {result.issues.map(issue => (
            <article key={`${issue.shotId}-${issue.sequence}-${issue.category}-${issue.issue}`} className="flex flex-col gap-2 bg-background/60 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">镜头 {String(issue.sequence).padStart(2, '0')}</span>
                <Badge variant={continuitySeverityVariant(issue.severity)}>{continuitySeverityLabel(issue.severity)}</Badge>
                <span className="text-xs text-muted-foreground">{issue.category}</span>
              </div>
              <p className="text-sm leading-6">{issue.issue}</p>
              <p className="text-sm leading-6 text-muted-foreground">建议：{issue.suggestion}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function continuitySeverityLabel(severity: 'info' | 'warning' | 'error'): string {
  return severity === 'error' ? '必须处理' : severity === 'warning' ? '建议处理' : '提示'
}

function continuitySeverityVariant(severity: 'info' | 'warning' | 'error'): 'default' | 'secondary' | 'outline' | 'destructive' {
  return severity === 'error' ? 'destructive' : severity === 'warning' ? 'secondary' : 'outline'
}

export function DirectorPromptRebuildReview({
  project,
  result,
  rawText,
  stale = false,
  appliedShotIds,
  applyingShotId,
  onApply,
}: {
  project: DirectorProjectDetail
  result?: DirectorPromptRebuildResult
  rawText?: string
  stale?: boolean
  appliedShotIds: Set<string>
  applyingShotId?: string
  onApply: (shotId: string, patch: UpdateDirectorShotInput) => void
}) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">视频提示词建议</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">等待执行结果</span>}
        </div>
        {rawText !== undefined && <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>}
        {rawText === undefined && <p className="text-sm leading-7 text-muted-foreground">执行重建阶段后，这里会显示可逐镜编辑和应用的提示词建议。</p>}
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">视频提示词建议</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">{result.shots.length} 个镜头</Badge>
        </div>
      </div>
      <p className="text-sm leading-7">{result.summary}</p>
      {result.shots.length === 0 ? (
        <p className="text-sm leading-7 text-muted-foreground">模型没有返回可应用的提示词建议。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {result.shots.map(suggestion => {
            const shot = project.shots.find(candidate => candidate.id === suggestion.shotId)
            return (
              <DirectorPromptSuggestionCard
                key={`${suggestion.shotId}-${suggestion.sequence}`}
                shot={shot}
                suggestion={suggestion}
                stale={stale}
                applied={appliedShotIds.has(suggestion.shotId)}
                saving={applyingShotId === suggestion.shotId}
                onApply={patch => onApply(suggestion.shotId, patch)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

export function DirectorDialogueReview({
  project,
  result,
  rawText,
  stale = false,
  appliedShotIds,
  applyingShotId,
  onApply,
}: {
  project: DirectorProjectDetail
  result?: DirectorDialogueResult
  rawText?: string
  stale?: boolean
  appliedShotIds: Set<string>
  applyingShotId?: string
  onApply: (shotId: string, lines: Array<{ speaker: string; text: string; delivery: string }>) => void
}) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">对白建议</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">等待执行结果</span>}
        </div>
        {rawText !== undefined && <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>}
        {rawText === undefined && <p className="text-sm leading-7 text-muted-foreground">执行对白整理后，这里会显示可逐镜编辑和应用的对白建议。</p>}
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">对白建议</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">{result.shots.length} 个镜头</Badge>
        </div>
      </div>
      <p className="text-sm leading-7">{result.summary}</p>
      {result.shots.length === 0 ? (
        <p className="text-sm leading-7 text-muted-foreground">模型没有返回可应用的对白建议。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {result.shots.map(suggestion => (
            <DirectorDialogueSuggestionCard
              key={`${suggestion.shotId}-${suggestion.sequence}`}
              shot={project.shots.find(candidate => candidate.id === suggestion.shotId)}
              suggestion={suggestion}
              stale={stale}
              applied={appliedShotIds.has(suggestion.shotId)}
              saving={applyingShotId === suggestion.shotId}
              onApply={lines => onApply(suggestion.shotId, lines)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function DirectorDialogueSuggestionCard({
  shot,
  suggestion,
  stale,
  applied,
  saving,
  onApply,
}: {
  shot?: DirectorShot
  suggestion: DirectorDialogueResult['shots'][number]
  stale: boolean
  applied: boolean
  saving: boolean
  onApply: (lines: Array<{ speaker: string; text: string; delivery: string }>) => void
}) {
  const [lines, setLines] = useState(suggestion.lines)

  useEffect(() => {
    setLines(suggestion.lines)
  }, [suggestion.shotId, suggestion.lines])

  const locked = shot?.status === 'locked'
  const missing = shot === undefined
  const invalid = lines.some(line => line.speaker.trim().length === 0 || line.text.trim().length === 0)
  const disabled = stale || locked || missing || saving
  return (
    <article className="flex flex-col gap-4 bg-background/60 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">镜头 {String(suggestion.sequence).padStart(2, '0')}</span>
          {locked && <Badge variant="outline">已锁定</Badge>}
          {applied && <Badge variant="secondary">已应用</Badge>}
          {missing && <Badge variant="destructive">镜头已不存在</Badge>}
        </div>
        <Button
          size="sm"
          disabled={disabled || invalid}
          onClick={() => onApply(lines.map(line => ({
            speaker: line.speaker.trim(),
            text: line.text.trim(),
            delivery: line.delivery.trim(),
          })))}
        >
          {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
          应用到分镜
        </Button>
      </div>
      {lines.length === 0 && <p className="text-sm leading-6 text-muted-foreground">当前镜头没有对白，点击下方按钮添加一行。</p>}
      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={`${suggestion.shotId}-line-${index}`} className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_10rem_auto]">
            <Input value={line.speaker} placeholder="说话人" disabled={disabled} onChange={event => setLines(current => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, speaker: event.target.value } : candidate))} />
            <Textarea value={line.text} placeholder="台词" className="min-h-10 resize-y leading-6" disabled={disabled} onChange={event => setLines(current => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, text: event.target.value } : candidate))} />
            <Input value={line.delivery} placeholder="语气" disabled={disabled} onChange={event => setLines(current => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, delivery: event.target.value } : candidate))} />
            <Button variant="ghost" size="icon" aria-label="删除对白" disabled={disabled} onClick={() => setLines(current => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="self-start" disabled={disabled} onClick={() => setLines(current => [...current, { speaker: '', text: '', delivery: '' }])}>
        <Plus data-icon="inline-start" />
        添加对白
      </Button>
      <p className="text-sm leading-6 text-muted-foreground">调整原因：{suggestion.rationale}</p>
      {stale && <p className="text-xs leading-5 text-muted-foreground">当前建议已过时，请重新执行对白整理后再应用。</p>}
      {locked && <p className="text-xs leading-5 text-muted-foreground">当前镜头已锁定，请先在分镜页解锁，应用后重新审核。</p>}
    </article>
  )
}

export function DirectorPromptSuggestionCard({
  shot,
  suggestion,
  stale,
  applied,
  saving,
  onApply,
}: {
  shot?: DirectorShot
  suggestion: DirectorPromptRebuildResult['shots'][number]
  stale: boolean
  applied: boolean
  saving: boolean
  onApply: (patch: UpdateDirectorShotInput) => void
}) {
  const [environmentPrompt, setEnvironmentPrompt] = useState(suggestion.environmentPrompt)
  const [videoPrompt, setVideoPrompt] = useState(suggestion.videoPrompt)
  const [negativePrompt, setNegativePrompt] = useState(suggestion.negativePrompt)

  useEffect(() => {
    setEnvironmentPrompt(suggestion.environmentPrompt)
    setVideoPrompt(suggestion.videoPrompt)
    setNegativePrompt(suggestion.negativePrompt)
  }, [suggestion.shotId, suggestion.environmentPrompt, suggestion.videoPrompt, suggestion.negativePrompt])

  const locked = shot?.status === 'locked'
  const missing = shot === undefined
  return (
    <article className="flex flex-col gap-4 bg-background/60 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">镜头 {String(suggestion.sequence).padStart(2, '0')}</span>
          {locked && <Badge variant="outline">已锁定</Badge>}
          {applied && <Badge variant="secondary">已应用</Badge>}
          {missing && <Badge variant="destructive">镜头已不存在</Badge>}
        </div>
        <Button
          size="sm"
          disabled={saving || stale || locked || missing}
          onClick={() => onApply({
            expectedVersion: shot?.version,
            environmentPrompt: environmentPrompt.trim().length > 0 ? environmentPrompt.trim() : null,
            videoPrompt: videoPrompt.trim().length > 0 ? videoPrompt.trim() : null,
            negativePrompt: negativePrompt.trim().length > 0 ? negativePrompt.trim() : null,
          })}
        >
          {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
          应用到分镜
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`director-prompt-environment-${suggestion.shotId}`}>
          环境提示词
          <Textarea id={`director-prompt-environment-${suggestion.shotId}`} className="min-h-28 resize-y leading-6" value={environmentPrompt} disabled={stale || locked || saving || missing} onChange={event => setEnvironmentPrompt(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`director-prompt-video-${suggestion.shotId}`}>
          动作与镜头提示词
          <Textarea id={`director-prompt-video-${suggestion.shotId}`} className="min-h-28 resize-y leading-6" value={videoPrompt} disabled={stale || locked || saving || missing} onChange={event => setVideoPrompt(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`director-prompt-negative-${suggestion.shotId}`}>
          负面提示词
          <Textarea id={`director-prompt-negative-${suggestion.shotId}`} className="min-h-28 resize-y leading-6" value={negativePrompt} disabled={stale || locked || saving || missing} onChange={event => setNegativePrompt(event.target.value)} />
        </label>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">调整原因：{suggestion.rationale}</p>
      {stale && <p className="text-xs leading-5 text-muted-foreground">当前建议已过时，请重新执行提示词重建后再应用。</p>}
      {locked && <p className="text-xs leading-5 text-muted-foreground">当前镜头已锁定，请先在分镜页解锁，应用后重新审核。</p>}
    </article>
  )
}

export function DirectorVideoShotList({ project, assetItems, onRetry, retryingShotId }: { project: DirectorProjectDetail; assetItems: Record<string, AssetItem>; onRetry: (shotId: string) => void; retryingShotId?: string }) {
  if (project.shots.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
        <Video className="size-8 text-muted-foreground" />
        <p className="font-medium">还没有可执行的分镜</p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">先完成分镜生成，逐镜检查并锁定后，再进入视频生成。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border/70">
      {project.shots.map(shot => {
        const videoBinding = shot.activeVideoAssetId === null
          ? undefined
          : project.assets.find(asset => asset.id === shot.activeVideoAssetId && asset.kind === 'shot_video')
        const videoAsset = videoBinding?.assetId === null || videoBinding?.assetId === undefined
          ? undefined
          : assetItems[videoBinding.assetId]
        const videoUrl = videoAsset?.url ?? videoAsset?.downloadUrl
        const downloadUrl = videoAsset?.downloadUrl
        return (
          <article key={shot.id} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                {shot.sequence}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{shot.slugline ?? `镜头 ${shot.sequence}`}</h3>
                  <Badge variant={shotStatusVariant(shot.status)}>{shotStatusLabel(shot.status)}</Badge>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{shot.narrative}</p>
                {shot.error?.message !== undefined && <p className="text-sm text-destructive">{String(shot.error.message)}</p>}
                {videoBinding?.staleAt !== null && videoBinding?.staleAt !== undefined && (
                  <p className="text-xs text-muted-foreground">当前视频已过时，历史资产仍保留在资产库中。</p>
                )}
              </div>
            </div>
            {videoUrl !== undefined && (
              <video
                className="aspect-video w-full shrink-0 bg-muted object-cover sm:w-56"
                controls
                preload="metadata"
                poster={videoAsset?.thumbnailUrl}
                src={videoUrl}
              >
                <track kind="captions" label="暂无字幕" srcLang="zh-CN" src="data:text/vtt,WEBVTT%0A%0A" />
              </video>
            )}
            {videoBinding !== undefined && videoUrl === undefined && (
              <span className="shrink-0 text-xs text-muted-foreground">视频资产已生成，预览地址准备中</span>
            )}
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              {downloadUrl !== undefined && (
                <Button asChild variant="outline" size="sm">
                  <a href={resolveApiUrl(downloadUrl)} download>
                    <Download data-icon="inline-start" />
                    下载本镜
                  </a>
                </Button>
              )}
              {shot.status === 'failed' && (
                <Button variant="outline" size="sm" onClick={() => onRetry(shot.id)} disabled={retryingShotId === shot.id}>
                  {retryingShotId === shot.id ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
                  重试本镜
                </Button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function shotStatusLabel(status: DirectorShot['status']): string {
  return {
    not_started: '未开始',
    needs_review: '待审核',
    ready: '待锁定',
    generating: '生成中',
    succeeded: '已生成',
    failed: '生成失败',
    locked: '已锁定',
  }[status]
}

export function shotStatusVariant(status: DirectorShot['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'succeeded') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'generating' || status === 'locked') return 'secondary'
  return 'outline'
}

export function applyDirectorVideoProgress(project: DirectorProjectDetail, outputSummary: Record<string, unknown> | null): DirectorProjectDetail {
  if (outputSummary === null || typeof outputSummary.shotGenerations !== 'object' || outputSummary.shotGenerations === null || Array.isArray(outputSummary.shotGenerations)) return project
  const shotGenerations = outputSummary.shotGenerations as Record<string, unknown>
  let changed = false
  const shots = project.shots.map(shot => {
    const progress = shotGenerations[shot.id]
    if (typeof progress !== 'object' || progress === null || Array.isArray(progress)) return shot
    const generationId = (progress as { generationId?: unknown }).generationId
    const status = (progress as { status?: unknown }).status
    if (typeof generationId !== 'string' || (status !== 'queued' && status !== 'processing')) return shot
    if (shot.status === 'generating' && shot.videoGenerationId === generationId) return shot
    changed = true
    return {
      ...shot,
      status: 'generating' as const,
      videoGenerationId: generationId,
      error: null,
    }
  })
  return changed ? { ...project, shots } : project
}

export function ReferenceEntityGroup({
  title,
  ownerType,
  entities,
  bindings,
  assetItems,
  saving,
  onAdd,
  onRemove,
}: {
  title: string
  ownerType: ReferenceOwnerType
  entities: Array<{ id: string; name: string; subtitle: string | null }>
  bindings: DirectorAsset[]
  assetItems: Record<string, AssetItem>
  saving: boolean
  onAdd: (target: ReferenceTarget) => void
  onRemove: (asset: DirectorAsset) => void
}) {
  const bindingKind = ownerType === 'character' ? 'character_reference' : 'location_reference'
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{entities.length} 个对象</span>
      </div>
      <div className="flex flex-col gap-2">
        {entities.map(entity => {
          const entityBindings = bindings.filter(binding => binding.kind === bindingKind && binding.ownerType === ownerType && binding.ownerId === entity.id)
          return (
            <article key={entity.id} className="flex flex-col gap-4 bg-muted/30 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{entity.name}</h4>
                  {entity.subtitle !== null && entity.subtitle.length > 0 && <span className="truncate text-xs text-muted-foreground">{entity.subtitle}</span>}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">绑定后会作为后续分镜与视频阶段的参考输入。</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-[24rem] sm:justify-end">
                {entityBindings.map(binding => {
                  const asset = binding.assetId === null ? undefined : assetItems[binding.assetId]
                  return (
                    <div key={binding.id} className="group relative flex size-20 flex-col overflow-hidden bg-background/70 ring-1 ring-border/60" title={asset?.fileName ?? '参考资产'}>
                      <AssetThumbnail kind="image" url={asset?.url} thumbnailUrl={asset?.thumbnailUrl} alt={asset?.fileName ?? '参考资产'} />
                      <button
                        type="button"
                        className="absolute top-1 right-1 flex size-5 items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => onRemove(binding)}
                        disabled={saving}
                        aria-label="移除参考资产"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      {binding.staleAt !== null && <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-1 py-0.5 text-center text-[10px] text-white">已过时</span>}
                    </div>
                  )
                })}
                <Button variant="ghost" size="sm" onClick={() => onAdd({ ownerType, ownerId: entity.id })} disabled={saving}>
                  <Plus data-icon="inline-start" /> 添加图片
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const SHOT_STATUS_LABELS: Record<DirectorShot['status'], string> = {
  not_started: '未开始',
  needs_review: '待审核',
  ready: '已确认',
  generating: '生成中',
  succeeded: '已完成',
  failed: '失败',
  locked: '已锁定',
}

export function StoryboardReview({ project, shots, assetItems, saving, onSave }: { project: DirectorProjectDetail; shots: DirectorShot[]; assetItems: Record<string, AssetItem>; saving: boolean; onSave: (shotId: string, input: UpdateDirectorShotInput) => Promise<void> }) {
  if (shots.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
        <p className="font-medium">还没有分镜草稿</p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">完成剧本分析、角色和场景阶段后，在右侧手动生成第一版分镜。</p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      {shots.map(shot => <StoryboardShotCard key={shot.id} project={project} shot={shot} assetItems={assetItems} saving={saving} onSave={onSave} />)}
    </section>
  )
}

export function referenceKeysForShot(shot: DirectorShot): string[] {
  return Array.isArray(shot.continuity?.referenceKeys)
    ? shot.continuity.referenceKeys.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
}

export function referenceBindingsForKey(project: DirectorProjectDetail, key: string): DirectorAsset[] {
  const ownerIds = [
    ...project.characters.filter(character => character.staleAt === null && character.name === key).map(character => character.id),
    ...project.locations.filter(location => location.staleAt === null && location.name === key).map(location => location.id),
  ]
  return project.assets.filter(asset => asset.staleAt === null && asset.assetId !== null && asset.ownerId !== null && ownerIds.includes(asset.ownerId))
}

export function ShotReferencePicker({
  project,
  shot,
  assetItems,
  selectedIds,
  disabled,
  onChange,
}: {
  project: DirectorProjectDetail
  shot: DirectorShot
  assetItems: Record<string, AssetItem>
  selectedIds: string[]
  disabled: boolean
  onChange: (assetId: string) => void
}) {
  const referenceKeys = referenceKeysForShot(shot)
  if (referenceKeys.length === 0) {
    return (
      <div className="flex flex-col gap-2 bg-background/50 px-3 py-3 text-sm">
        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">参考资产确认</span>
        <p className="leading-6 text-muted-foreground">本镜头没有模型建议的角色或场景参考，可直接进入人工审核。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-background/50 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">参考资产确认</span>
        <span className="text-xs text-muted-foreground">已选 {selectedIds.length} 项；锁定前必须完成确认</span>
      </div>
      <div className="flex flex-col gap-3">
        {referenceKeys.map(key => {
          const bindings = referenceBindingsForKey(project, key)
          return (
            <div key={key} className="flex flex-col gap-2">
              <span className="text-sm font-medium">{key}</span>
              {bindings.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bindings.map(binding => {
                    const asset = binding.assetId === null ? undefined : assetItems[binding.assetId]
                    const selected = selectedIds.includes(binding.id)
                    return (
                      <button
                        key={binding.id}
                        type="button"
                        className={`flex items-center gap-2 px-2 py-2 text-left text-xs transition-colors ${selected ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => onChange(binding.id)}
                      >
                        <span className="size-10 shrink-0 overflow-hidden bg-background/70">
                          <AssetThumbnail kind="image" url={asset?.url} thumbnailUrl={asset?.thumbnailUrl} alt={asset?.fileName ?? `${key} 参考资产`} />
                        </span>
                        <span className="flex items-center gap-1">
                          {selected && <Check className="size-3.5" />}
                          {asset?.fileName ?? '图片资产'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">尚未为此对象绑定当前参考图，请先到“参考资产”Tab 完成绑定。</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StoryboardShotCard({
  project,
  shot,
  assetItems,
  saving,
  onSave,
}: {
  project: DirectorProjectDetail
  shot: DirectorShot
  assetItems: Record<string, AssetItem>
  saving: boolean
  onSave: (shotId: string, input: UpdateDirectorShotInput) => Promise<void>
}) {
  const [narrative, setNarrative] = useState(shot.narrative)
  const [environmentPrompt, setEnvironmentPrompt] = useState(shot.environmentPrompt ?? '')
  const [videoPrompt, setVideoPrompt] = useState(shot.videoPrompt ?? '')
  const [durationSeconds, setDurationSeconds] = useState(shot.durationSeconds === null ? '' : String(shot.durationSeconds))
  const [referenceAssetIds, setReferenceAssetIds] = useState(shot.referenceAssetIds)
  const locked = shot.status === 'locked'
  const stale = shot.staleAt !== null
  const dirty = narrative !== shot.narrative
    || environmentPrompt !== (shot.environmentPrompt ?? '')
    || videoPrompt !== (shot.videoPrompt ?? '')
    || durationSeconds !== (shot.durationSeconds === null ? '' : String(shot.durationSeconds))
    || referenceAssetIds.join('|') !== shot.referenceAssetIds.join('|')

  useEffect(() => {
    setNarrative(shot.narrative)
    setEnvironmentPrompt(shot.environmentPrompt ?? '')
    setVideoPrompt(shot.videoPrompt ?? '')
    setDurationSeconds(shot.durationSeconds === null ? '' : String(shot.durationSeconds))
    setReferenceAssetIds(shot.referenceAssetIds)
  }, [shot.id, shot.version, shot.narrative, shot.environmentPrompt, shot.videoPrompt, shot.durationSeconds, shot.referenceAssetIds.join('|')])

  const camera = shot.camera
  const dialogueLines = dialogueLinesFor(shot.dialogue)
  const referenceKeys = referenceKeysForShot(shot)
  const toggleReferenceAsset = (assetId: string) => {
    setReferenceAssetIds(current => current.includes(assetId) ? current.filter(id => id !== assetId) : [...current, assetId])
  }
  const save = () => {
    const parsedDuration = durationSeconds.trim() === '' ? null : Number(durationSeconds)
    if (parsedDuration !== null && (!Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 120)) return
    void onSave(shot.id, {
      narrative,
      environmentPrompt: environmentPrompt.trim().length > 0 ? environmentPrompt : null,
      videoPrompt: videoPrompt.trim().length > 0 ? videoPrompt : null,
      durationSeconds: parsedDuration,
      referenceAssetIds,
    })
  }

  return (
    <article className={`flex flex-col gap-4 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-65 grayscale' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">镜头 {String(shot.sequence).padStart(2, '0')}</span>
            {shot.slugline !== null && <h3 className="font-semibold">{shot.slugline}</h3>}
            <Badge variant={stale ? 'outline' : 'secondary'}>{stale ? '已过时，仅供参考' : SHOT_STATUS_LABELS[shot.status]}</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{locked ? '本镜头已锁定，解锁后才能继续编辑。' : '修改后会回到待审核状态。确认无误后再锁定。'}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor={`shot-${shot.id}-duration`}>
          时长
          <Input id={`shot-${shot.id}-duration`} className="h-8 w-20" type="number" min={1} max={120} value={durationSeconds} disabled={locked || saving} onChange={event => setDurationSeconds(event.target.value)} />
          秒
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`shot-${shot.id}-narrative`}>
        镜头叙事
        <Textarea id={`shot-${shot.id}-narrative`} className="min-h-20 resize-y leading-6" value={narrative} disabled={locked || saving} onChange={event => setNarrative(event.target.value)} />
      </label>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">摄影</span>
          <p className="leading-6 text-muted-foreground">{[camera['shotSize'], camera['angle'], camera['movement'], camera['lens']].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ') || '尚未填写摄影参数'}</p>
          {typeof camera['composition'] === 'string' && camera['composition'].length > 0 && <p className="leading-6 text-muted-foreground">构图：{camera['composition']}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">参考对象</span>
          <p className="leading-6 text-muted-foreground">{referenceKeys.length > 0 ? referenceKeys.join(' · ') : '暂无明确参考对象'}</p>
          {dialogueLines.length > 0 && <p className="leading-6 text-muted-foreground">对白：{dialogueLines.map(line => `${line.speaker}：“${line.text}”`).join(' ')}</p>}
        </div>
      </div>

      <ShotReferencePicker project={project} shot={shot} assetItems={assetItems} selectedIds={referenceAssetIds} disabled={locked || saving} onChange={toggleReferenceAsset} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`shot-${shot.id}-environment`}>
          环境提示词
          <Textarea id={`shot-${shot.id}-environment`} className="min-h-24 resize-y leading-6" value={environmentPrompt} disabled={locked || saving} onChange={event => setEnvironmentPrompt(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`shot-${shot.id}-video`}>
          动作提示词
          <Textarea id={`shot-${shot.id}-video`} className="min-h-24 resize-y leading-6" value={videoPrompt} disabled={locked || saving} onChange={event => setVideoPrompt(event.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {locked ? (
          <Button variant="outline" size="sm" onClick={() => void onSave(shot.id, { status: 'needs_review' })} disabled={saving}>
            解锁编辑
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={save} disabled={!dirty || saving || narrative.trim().length === 0}>
              保存修改
            </Button>
            <Button size="sm" onClick={() => void onSave(shot.id, { status: 'locked' })} disabled={dirty || saving || stale}>
              锁定本镜头
            </Button>
          </>
        )}
      </div>
    </article>
  )
}

export function dialogueLinesFor(dialogue: DirectorShot['dialogue']): Array<{ speaker: string; text: string }> {
  if (dialogue === null || !Array.isArray(dialogue.lines)) return []
  return dialogue.lines.filter((line): line is { speaker: string; text: string } => {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) return false
    const candidate = line as { speaker?: unknown; text?: unknown }
    return typeof candidate.speaker === 'string' && typeof candidate.text === 'string'
  })
}

export function ScreenplayChatWorkspace({
  messages,
  pendingMessage,
  screenplay,
  scriptVersion,
  scriptVersionId,
  currentScriptVersionId,
  scriptVersions,
  scriptVersionsLoading,
  scriptVersionLoading,
  onSelectScriptVersion,
  analysis,
  analysisStale,
  modelId,
  textModels,
  message,
  running,
  onModelChange,
  onMessageChange,
  onSend,
}: {
  messages: DirectorScriptMessage[]
  pendingMessage?: ScriptMessageView
  screenplay: string
  scriptVersion: number
  scriptVersionId: string
  currentScriptVersionId: string
  scriptVersions: DirectorScriptVersionSummary[]
  scriptVersionsLoading: boolean
  scriptVersionLoading: boolean
  onSelectScriptVersion: (versionId: string) => void
  analysis?: DirectorAnalysisResult
  analysisStale: boolean
  modelId: string
  textModels: ModelCatalogItem[]
  message: string
  running: boolean
  onModelChange: (value: string) => void
  onMessageChange: (value: string) => void
  onSend: () => void
}) {
  const isHistorical = scriptVersionId !== currentScriptVersionId
  const canSend = message.trim().length > 0 && modelId.length > 0 && !running && !isHistorical
  const visibleMessages: ScriptMessageView[] = pendingMessage === undefined ? messages : [...messages, pendingMessage]
  return (
    <div className="flex min-h-[min(78vh,860px)] flex-col gap-0 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col pb-8 lg:pr-8">
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">标准剧本</h2>
                <Badge variant="secondary">v{scriptVersion}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="查看剧本历史版本"
                      title="查看历史版本"
                      disabled={scriptVersionsLoading && scriptVersions.length === 0}
                    >
                      {scriptVersionLoading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <History data-icon="inline-start" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80">
                    <DropdownMenuLabel>剧本历史版本</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {scriptVersionsLoading && <DropdownMenuItem disabled>加载历史版本…</DropdownMenuItem>}
                    {!scriptVersionsLoading && scriptVersions.length === 0 && (
                      <DropdownMenuItem disabled>暂无历史版本</DropdownMenuItem>
                    )}
                    {scriptVersions.map(version => (
                      <DropdownMenuItem
                        key={version.id}
                        onSelect={() => onSelectScriptVersion(version.id)}
                        className="items-start gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">剧本 v{version.version}</span>
                            {version.id === scriptVersionId && <Check data-icon="inline-end" className="text-primary" />}
                          </div>
                          <span className="block text-xs text-muted-foreground">
                            {formatScriptVersionDate(version.createdAt)} · {version.id === currentScriptVersionId ? '最新版本' : '历史版本'}
                          </span>
                          {version.synopsis && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{version.synopsis}</span>}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-sm text-muted-foreground">每次对话都会生成一份完整剧本，不会只返回修改片段。</p>
              {isHistorical && (
                <p className="text-xs text-muted-foreground">当前正在查看历史版本，只读；切换回最新版本后可以继续对话。</p>
              )}
            </div>
          </div>
          {analysisStale && <Badge variant="outline">分析待更新</Badge>}
        </div>
        <ScrollArea className="min-h-0 flex-1 bg-muted/20">
          {screenplay.trim().length > 0
            ? <ScreenplayDocument text={screenplay} />
            : <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 text-center font-sans sm:px-10">
              <Sparkles className="size-8 text-primary/60" />
              <p className="font-medium">还没有剧本</p>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">在右侧告诉编剧你想创作什么，例如“写一个三分钟、发生在雨夜便利店的反转短剧”。</p>
            </div>}
        </ScrollArea>
        {analysis !== undefined && (
          <div className="flex flex-col gap-2 pt-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span>当前分析摘要</span>
              {analysisStale && <span className="normal-case tracking-normal text-amber-600">等待重新整理</span>}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{analysis.summary}</p>
          </div>
        )}
      </section>

      <Separator orientation="vertical" className="hidden h-auto lg:block" />

      <section className="flex min-w-0 flex-1 flex-col pt-8 lg:pl-8 lg:pt-0">
        <div className="flex items-start gap-3 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground">
            <MessageCircle className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">和编剧对话</h2>
            <p className="text-sm text-muted-foreground">不用填写简介、原文或标题，直接说你想要什么。</p>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 bg-muted/20 px-4 sm:px-5">
          <div className="flex flex-col gap-4 py-5">
            {visibleMessages.length === 0 && (
              <div className="flex flex-col gap-3 py-6">
                <p className="text-sm font-medium">可以这样开始：</p>
                {['帮我写一个三分钟的都市反转短剧', '把结尾改成开放式，但保留人物关系', '把第二场改得更紧张，增加一个视觉动作'].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    className="bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                    onClick={() => onMessageChange(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {visibleMessages.map(item => (
              <div key={item.id} className={cn('flex flex-col gap-1', item.role === 'user' ? 'items-end' : 'items-start')}>
                {item.deliveryStatus === 'queued' && <span className="px-1 text-[11px] text-muted-foreground">消息已保存，正在分析</span>}
                {item.deliveryStatus === 'failed' && <span className="px-1 text-[11px] text-destructive">分析失败，消息已保留，可直接重试</span>}
                <span className="px-1 text-[11px] text-muted-foreground">{item.role === 'user' ? '你' : '编剧'} · v{item.scriptVersion ?? scriptVersion}</span>
                <div className={cn(
                  'max-w-[92%] whitespace-pre-wrap px-4 py-3 text-sm leading-6',
                  item.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground',
                )}>
                  {item.content}
                </div>
              </div>
            ))}
            {running && (
              <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                编剧正在整理完整剧本…
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="sticky bottom-0 flex flex-col gap-3 bg-background/95 pt-4 backdrop-blur">
          <Textarea
            value={message}
            onChange={event => onMessageChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (canSend) onSend()
              }
            }}
            placeholder="告诉编剧你想创作或修改什么…（Enter 发送，Shift + Enter 换行）"
            className="min-h-24 resize-none leading-6"
            maxLength={8_000}
            disabled={running || isHistorical}
          />
          <div className="flex items-center justify-between gap-3">
            <Select value={modelId} onValueChange={onModelChange} disabled={running}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="选择编剧模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {textModels.map(model => <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button onClick={onSend} disabled={!canSend}>
              {running ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}
              {running ? '整理中' : isHistorical ? '切回最新版本后编辑' : '发送修改'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export function AnalysisReview({ result, rawText, stale = false }: { result?: DirectorAnalysisResult; rawText?: string; stale?: boolean }) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">分析结果</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">原始模型输出</span>}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">结构化分析</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">可供后续阶段消费</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">一句话梗概</span>
        <p className="text-sm leading-7">{result.summary}</p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">主题与命题</span>
          <p className="text-sm leading-6 text-muted-foreground">{result.theme}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">目标观众</span>
          <p className="text-sm leading-6 text-muted-foreground">{result.audience}</p>
        </div>
      </div>

      {result.structure.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">结构节拍</h3>
            <div className="flex flex-col gap-4">
              {result.structure.map((section, index) => (
                <div key={`${section.name}-${index}`} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{section.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{section.purpose}</p>
                  {section.beats.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
                      {section.beats.map((beat, beatIndex) => <li key={`${beat}-${beatIndex}`}>· {beat}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {result.characters.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">角色卡</h3>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {result.characters.map((character, index) => (
                <div key={`${character.name}-${index}`} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{character.name}</span>
                    {character.role.length > 0 && <span className="text-xs text-muted-foreground">{character.role}</span>}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{character.description}</p>
                  {character.traits.length > 0 && <p className="text-xs leading-5 text-muted-foreground">{character.traits.join(' · ')}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {result.locations.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">场景卡</h3>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {result.locations.map((location, index) => (
                <div key={`${location.name}-${index}`} className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{location.name}</span>
                  <p className="text-sm leading-6 text-muted-foreground">{location.description}</p>
                  {location.atmosphere.length > 0 && <p className="text-xs leading-5 text-muted-foreground">氛围：{location.atmosphere}</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(result.continuityRisks.length > 0 || result.visualMotifs.length > 0) && (
        <>
          <Separator />
          <div className="grid gap-5 sm:grid-cols-2">
            {result.continuityRisks.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">连续性风险</h3>
                <ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
                  {result.continuityRisks.map((risk, index) => <li key={`${risk}-${index}`}>· {risk}</li>)}
                </ul>
              </div>
            )}
            {result.visualMotifs.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">视觉母题</h3>
                <ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
                  {result.visualMotifs.map((motif, index) => <li key={`${motif}-${index}`}>· {motif}</li>)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {rawText !== undefined && (
        <details className="flex flex-col gap-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看原始模型输出</summary>
          <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{rawText}</p>
        </details>
      )}
    </section>
  )
}

export function LocationsReview({ result, rawText, stale = false }: { result?: DirectorLocationsResult; rawText?: string; stale?: boolean }) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">场景阶段输出</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">原始模型输出</span>}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">场景卡</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">可供分镜与资产消费</Badge>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
        {result.locations.map((location, index) => (
          <article key={`${location.name}-${index}`} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{location.name}</h3>
                <span className="text-xs text-muted-foreground">{location.timeOfDay}</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{location.description}</p>
            <div className="grid gap-3 text-sm leading-6">
              <div>
                <span className="text-xs text-muted-foreground">叙事功能</span>
                <p>{location.narrativeFunction}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">氛围</span>
                <p>{location.atmosphere}</p>
              </div>
            </div>
            {location.visualAnchors.length > 0 && <p className="text-xs leading-5 text-muted-foreground">视觉锚点：{location.visualAnchors.join(' · ')}</p>}
            {location.continuityNotes.length > 0 && <p className="text-xs leading-5 text-muted-foreground">连续性：{location.continuityNotes.join(' · ')}</p>}
          </article>
        ))}
      </div>
      {result.continuityNotes.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">跨场景连续性</h3>
            <ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
              {result.continuityNotes.map((note, index) => <li key={`${note}-${index}`}>· {note}</li>)}
            </ul>
          </div>
        </>
      )}
      {rawText !== undefined && (
        <details className="flex flex-col gap-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看原始模型输出</summary>
          <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{rawText}</p>
        </details>
      )}
    </section>
  )
}

export function CharactersReview({ result, rawText, stale = false }: { result?: DirectorCharactersResult; rawText?: string; stale?: boolean }) {
  if (result === undefined) {
    return (
      <section className={`flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">角色阶段输出</h2>
          {stale ? <Badge variant="outline">已过时，仅供参考</Badge> : <span className="text-xs text-muted-foreground">原始模型输出</span>}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{rawText}</p>
      </section>
    )
  }

  return (
    <section className={`flex flex-col gap-5 bg-muted/30 px-4 py-4 sm:px-5 ${stale ? 'opacity-70 grayscale' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">角色卡</h2>
        <div className="flex items-center gap-2">
          {stale && <Badge variant="outline">已过时，仅供参考</Badge>}
          <Badge variant="secondary">可供视觉与分镜消费</Badge>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
        {result.characters.map((character, index) => (
          <article key={`${character.name}-${index}`} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{character.name}</h3>
                <span className="text-xs text-muted-foreground">{character.role}</span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{character.description}</p>
            <div className="grid gap-3 text-sm leading-6">
              <div>
                <span className="text-xs text-muted-foreground">目标</span>
                <p>{character.goal}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">冲突</span>
                <p>{character.conflict}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">弧线</span>
                <p>{character.arc}</p>
              </div>
            </div>
            {character.traits.length > 0 && <p className="text-xs leading-5 text-muted-foreground">特质：{character.traits.join(' · ')}</p>}
            {character.visualSignature.length > 0 && <p className="text-xs leading-5 text-muted-foreground">视觉特征：{character.visualSignature}</p>}
          </article>
        ))}
      </div>
      {result.relationshipNotes.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">关系与戏剧张力</h3>
            <ul className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
              {result.relationshipNotes.map((note, index) => <li key={`${note}-${index}`}>· {note}</li>)}
            </ul>
          </div>
        </>
      )}
      {rawText !== undefined && (
        <details className="flex flex-col gap-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看原始模型输出</summary>
          <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{rawText}</p>
        </details>
      )}
    </section>
  )
}

export function PhaseStatusPanel({
  project,
  phases,
  modelId,
  textModels,
  running,
  onModelChange,
  onRunPhase,
  runLabel,
  blockedByUnsavedChanges,
}: {
  project: DirectorProjectDetail
  phases: DirectorPhase[]
  modelId?: string
  textModels?: ModelCatalogItem[]
  running?: boolean
  onModelChange?: (value: string) => void
  onRunPhase?: () => void
  runLabel?: string
  blockedByUnsavedChanges?: boolean
}) {
  const states = project.phases.filter(state => phases.includes(state.phase))
  const primaryPhase = phases[0] ?? 'analyze'
  const status = states.find(state => state.status !== 'completed')?.status ?? states[0]?.status ?? 'not_started'
  const failedState = states.find(state => state.status === 'failed' && state.lastError !== null && state.lastError !== undefined)
  return (
    <aside className="relative flex flex-col gap-4 lg:pl-6">
      <Separator orientation="vertical" className="absolute inset-y-0 left-0 hidden h-auto lg:block" />
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">阶段状态</span>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(status)}>{STATUS_LABELS[status]}</Badge>
          <span className="text-sm text-muted-foreground">{states.length === 1 ? DIRECTOR_PHASE_LABELS[states[0]?.phase ?? 'analyze'] : '参考资产'}</span>
        </div>
      </div>
      <Separator />
      {modelId !== undefined && textModels !== undefined && onModelChange !== undefined && onRunPhase !== undefined && runLabel !== undefined && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor={`director-${primaryPhase}-model`}>
            执行模型
            <Select value={modelId} onValueChange={onModelChange} disabled={running || textModels.length === 0}>
              <SelectTrigger id={`director-${primaryPhase}-model`} className="w-full">
                <SelectValue placeholder="选择文本模型" />
              </SelectTrigger>
              <SelectContent>
                {textModels.map(model => <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button
            onClick={onRunPhase}
            disabled={running || blockedByUnsavedChanges || (status !== 'ready' && status !== 'failed' && status !== 'needs_review') || textModels.length === 0}
          >
            {running ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
            {running ? '阶段执行中' : runLabel}
          </Button>
          {blockedByUnsavedChanges && <p className="text-xs leading-5 text-muted-foreground">请先保存剧本修改，再启动分析。</p>}
        </div>
      )}
      {failedState?.lastError !== null && failedState?.lastError !== undefined && (
        <p className="text-xs leading-5 text-destructive">{failedState.lastError.message}</p>
      )}
      <Separator />
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="leading-6 text-muted-foreground">阶段结果会按版本保存，确认后才会成为下一阶段的输入。</span>
        </div>
        <div className="flex items-start gap-2">
          <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="leading-6 text-muted-foreground">当前项目只展示真实状态，不使用演示数据。</span>
        </div>
      </div>
    </aside>
  )
}
function formatScriptVersionDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

type DirectorPhase = (typeof DIRECTOR_PHASES)[number]

const STATUS_LABELS: Record<DirectorProjectDetail['phases'][number]['status'], string> = {
  not_started: '未开始',
  ready: '就绪',
  queued: '排队中',
  running: '运行中',
  needs_review: '待审核',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
}

function statusVariant(status: DirectorProjectDetail['phases'][number]['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'completed') return 'default'
  if (status === 'running' || status === 'queued') return 'secondary'
  if (status === 'failed') return 'destructive'
  return 'outline'
}
