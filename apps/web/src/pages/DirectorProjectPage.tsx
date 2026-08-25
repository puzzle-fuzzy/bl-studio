import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CircleDashed, FileText, History, Image as ImageIcon, Loader2, LockKeyhole, MessageCircle, Plus, Save, Send, Sparkles, Trash2, Video } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { AssetItem, DirectorAnalysisResult, DirectorAsset, DirectorAssemblyPreflight, DirectorCharactersResult, DirectorContinuityResult, DirectorDialogueResult, DirectorLocationsResult, DirectorMusicEstimate, DirectorProjectDetail, DirectorPromptRebuildResult, DirectorScriptMessage, DirectorScriptVersion, DirectorScriptVersionSummary, DirectorShot, DirectorVideoEstimate, ModelCatalogItem, UpdateDirectorShotInput } from '@bailian-studio/api-client'
import { ApiClientError, DIRECTOR_PHASE_LABELS, DIRECTOR_PHASES } from '@bailian-studio/api-client'
import { DirectorAnalysisResultSchema, DirectorCharactersResultSchema, DirectorContinuityResultSchema, DirectorDialogueResultSchema, DirectorLocationsResultSchema, DirectorPromptRebuildResultSchema } from '@bailian-studio/api-client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { AssetVideoPlayer } from '@/components/assets/AssetVideoPlayer'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { VirtualScrollArea } from '@/components/ui/virtual-scroll-area'
import { apiClient } from '@/lib/api'
import { modelNameZh } from '@/lib/model-modes'
import { formatCents } from '@/lib/money'
import { useReferenceAssetsStore } from '@/stores/reference-assets-store'
import { useModelCatalogStore } from '@/stores/model-catalog-store'
import { cn } from '@/lib/utils'
import { ScreenplayDocument } from '@/components/director/ScreenplayDocument'

type DirectorPhase = (typeof DIRECTOR_PHASES)[number]
type ReferenceOwnerType = 'character' | 'location'
type ReferenceTarget = { ownerType: ReferenceOwnerType; ownerId: string }
type ScriptMessageDeliveryStatus = 'queued' | 'failed'
type ScriptMessageView = DirectorScriptMessage & { deliveryStatus?: ScriptMessageDeliveryStatus }

function directorClientErrorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof ApiClientError) {
    return {
      errorType: error.name,
      errorCode: error.code,
      status: error.status,
      traceId: error.traceId,
    }
  }
  return {
    errorType: error instanceof Error ? error.name : 'unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

function logDirectorClientEvent(event: string, meta: Record<string, unknown> = {}): void {
  const payload = { event, scope: 'director-client', ...meta }
  if (event.endsWith('.failed')) {
    console.error('[director-client]', payload)
  } else {
    console.info('[director-client]', payload)
  }
}

function formatScriptVersionDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TAB_ITEMS: Array<{ value: string; label: string; phases: DirectorPhase[] }> = [
  { value: 'analyze', label: '剧本分析', phases: ['analyze'] },
  { value: 'characters', label: '角色', phases: ['characters'] },
  { value: 'locations', label: '场景', phases: ['locations'] },
  { value: 'references', label: '参考资产', phases: ['characterRefs', 'locationRefs'] },
  { value: 'storyboard', label: '分镜', phases: ['storyboard'] },
  { value: 'continuity', label: '连贯性', phases: ['continuity'] },
  { value: 'prompts', label: '视频提示词', phases: ['rebuild'] },
  { value: 'dialogue', label: '对白', phases: ['dialogue'] },
  { value: 'videos', label: '视频生成', phases: ['videos'] },
  { value: 'bgm', label: '音乐', phases: ['bgm'] },
  { value: 'assemble', label: '合成', phases: ['assemble'] },
]

const STATUS_LABELS: Record<DirectorProjectDetail['phases'][number]['status'], string> = {
  queued: '等待执行',
  not_started: '未开始',
  ready: '待确认',
  running: '执行中',
  needs_review: '待审核',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
}

function phaseStateFor(project: DirectorProjectDetail, phases: DirectorPhase[]) {
  return project.phases.find(state => phases.includes(state.phase))
}

function statusVariant(status: DirectorProjectDetail['phases'][number]['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'ready' || status === 'needs_review') return 'secondary'
  return 'outline'
}

export function DirectorProjectPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<DirectorProjectDetail>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [title, setTitle] = useState('')
  const [storyText, setStoryText] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [saving, setSaving] = useState(false)
  const [analysisModelId, setAnalysisModelId] = useState('')
  const [charactersModelId, setCharactersModelId] = useState('')
  const [locationsModelId, setLocationsModelId] = useState('')
  const [storyboardModelId, setStoryboardModelId] = useState('')
  const [continuityModelId, setContinuityModelId] = useState('')
  const [videoModelId, setVideoModelId] = useState('')
  const [activeRunId, setActiveRunId] = useState<string>()
  const [activePhase, setActivePhase] = useState<DirectorPhase>()
  const [videoEstimate, setVideoEstimate] = useState<DirectorVideoEstimate>()
  const [videoConfirmOpen, setVideoConfirmOpen] = useState(false)
  const [videoEstimating, setVideoEstimating] = useState(false)
  const [videoRetryShotId, setVideoRetryShotId] = useState<string>()
  const [videoRetryingShotId, setVideoRetryingShotId] = useState<string>()
  const [analysisText, setAnalysisText] = useState<string>()
  const [analysisResult, setAnalysisResult] = useState<DirectorAnalysisResult>()
  const [analysisStale, setAnalysisStale] = useState(false)
  const [scriptMessages, setScriptMessages] = useState<DirectorScriptMessage[]>([])
  const [pendingScriptMessage, setPendingScriptMessage] = useState<ScriptMessageView>()
  const [scriptMessagesError, setScriptMessagesError] = useState<string>()
  const [scriptMessage, setScriptMessage] = useState('')
  const [scriptVersions, setScriptVersions] = useState<DirectorScriptVersionSummary[]>([])
  const [selectedScriptVersion, setSelectedScriptVersion] = useState<DirectorScriptVersion>()
  const [scriptVersionsLoading, setScriptVersionsLoading] = useState(false)
  const [scriptVersionLoading, setScriptVersionLoading] = useState(false)
  const [scriptVersionsError, setScriptVersionsError] = useState<string>()
  const scriptMessagesRequestRef = useRef(0)
  const scriptVersionsRequestRef = useRef(0)
  const scriptVersionRequestRef = useRef(0)
  const scriptVersionCacheRef = useRef(new Map<string, DirectorScriptVersion>())
  const [charactersText, setCharactersText] = useState<string>()
  const [charactersResult, setCharactersResult] = useState<DirectorCharactersResult>()
  const [charactersStale, setCharactersStale] = useState(false)
  const [locationsText, setLocationsText] = useState<string>()
  const [locationsResult, setLocationsResult] = useState<DirectorLocationsResult>()
  const [locationsStale, setLocationsStale] = useState(false)
  const [continuityText, setContinuityText] = useState<string>()
  const [continuityResult, setContinuityResult] = useState<DirectorContinuityResult>()
  const [continuityStale, setContinuityStale] = useState(false)
  const [promptRebuildModelId, setPromptRebuildModelId] = useState('')
  const [promptRebuildText, setPromptRebuildText] = useState<string>()
  const [promptRebuildResult, setPromptRebuildResult] = useState<DirectorPromptRebuildResult>()
  const [promptRebuildStale, setPromptRebuildStale] = useState(false)
  const [applyingPromptShotId, setApplyingPromptShotId] = useState<string>()
  const [appliedPromptShotIds, setAppliedPromptShotIds] = useState<Set<string>>(new Set())
  const [dialogueModelId, setDialogueModelId] = useState('')
  const [dialogueText, setDialogueText] = useState<string>()
  const [dialogueResult, setDialogueResult] = useState<DirectorDialogueResult>()
  const [dialogueStale, setDialogueStale] = useState(false)
  const [applyingDialogueShotId, setApplyingDialogueShotId] = useState<string>()
  const [appliedDialogueShotIds, setAppliedDialogueShotIds] = useState<Set<string>>(new Set())
  const [musicModelId, setMusicModelId] = useState('')
  const [musicPrompt, setMusicPrompt] = useState('')
  const [musicDuration, setMusicDuration] = useState('60')
  const [musicEstimate, setMusicEstimate] = useState<DirectorMusicEstimate>()
  const [musicConfirmOpen, setMusicConfirmOpen] = useState(false)
  const [musicEstimating, setMusicEstimating] = useState(false)
  const [assemblyPreflight, setAssemblyPreflight] = useState<DirectorAssemblyPreflight>()
  const [assemblyWidth, setAssemblyWidth] = useState('1080')
  const [assemblyHeight, setAssemblyHeight] = useState('1920')
  const [assemblyFps, setAssemblyFps] = useState('30')
  const [assemblyAudioVolume, setAssemblyAudioVolume] = useState('1')
  const [assemblyPreflighting, setAssemblyPreflighting] = useState(false)
  const [assemblyConfirmOpen, setAssemblyConfirmOpen] = useState(false)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  const [referenceTarget, setReferenceTarget] = useState<ReferenceTarget>()
  const referenceAssets = useReferenceAssetsStore(state => state.assets)
  const loadReferenceAssets = useReferenceAssetsStore(state => state.getAssets)
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const textModels = useMemo(() => models.filter(model => model.category === 'text'), [models])
  const videoModels = useMemo(() => models.filter(model => (
    model.category === 'video'
    && model.operation === 'video.reference-to-video'
    && model.availability?.enabled !== false
  )), [models])
  const musicModels = useMemo(() => models.filter(model => (
    model.category === 'audio'
    && model.operation === 'music.generate'
    && model.availability?.enabled !== false
  )), [models])
  const boundReferenceAssetIds = useMemo(() => {
    if (project === undefined) return []
    return [...new Set(project.assets.map(asset => asset.assetId).filter((assetId): assetId is string => assetId !== null))]
  }, [project])

  const reloadScriptMessages = (projectId: string, reason: string) => {
    const requestSequence = scriptMessagesRequestRef.current + 1
    scriptMessagesRequestRef.current = requestSequence
    logDirectorClientEvent('script_messages.load.started', { projectId, reason, requestSequence })
    return apiClient.listDirectorScriptMessages(projectId)
      .then(messages => {
        if (requestSequence !== scriptMessagesRequestRef.current) {
          logDirectorClientEvent('script_messages.load.stale_response', { projectId, reason, requestSequence })
          return
        }
        setScriptMessages(messages)
        setScriptMessagesError(undefined)
        setPendingScriptMessage(current => {
          if (current === undefined || current.runId === null) return current
          return messages.some(message => message.runId === current.runId && message.role === 'user') ? undefined : current
        })
        logDirectorClientEvent('script_messages.load.succeeded', { projectId, reason, requestSequence, messageCount: messages.length })
      })
      .catch(error => {
        if (requestSequence !== scriptMessagesRequestRef.current) return
        setScriptMessagesError('对话记录暂时无法加载，现有内容仍会保留。')
        logDirectorClientEvent('script_messages.load.failed', {
          projectId,
          reason,
          requestSequence,
          ...directorClientErrorMeta(error),
        })
      })
  }

  const reloadScriptVersions = (projectId: string, reason: string) => {
    const requestSequence = scriptVersionsRequestRef.current + 1
    scriptVersionsRequestRef.current = requestSequence
    setScriptVersionsLoading(true)
    logDirectorClientEvent('script_versions.load.started', { projectId, reason, requestSequence })
    return apiClient.listDirectorScriptVersions(projectId)
      .then(versions => {
        if (requestSequence !== scriptVersionsRequestRef.current) {
          logDirectorClientEvent('script_versions.load.stale_response', { projectId, reason, requestSequence })
          return
        }
        setScriptVersions(versions)
        setScriptVersionsError(undefined)
        logDirectorClientEvent('script_versions.load.succeeded', { projectId, reason, requestSequence, versionCount: versions.length })
      })
      .catch(error => {
        if (requestSequence !== scriptVersionsRequestRef.current) return
        setScriptVersionsError('历史版本暂时无法加载，请稍后重试。')
        logDirectorClientEvent('script_versions.load.failed', {
          projectId,
          reason,
          requestSequence,
          ...directorClientErrorMeta(error),
        })
      })
      .finally(() => {
        if (requestSequence === scriptVersionsRequestRef.current) setScriptVersionsLoading(false)
      })
  }

  const selectScriptVersion = async (projectId: string, versionId: string) => {
    const requestSequence = scriptVersionRequestRef.current + 1
    scriptVersionRequestRef.current = requestSequence
    const cached = scriptVersionCacheRef.current.get(versionId)
    if (cached !== undefined) {
      setSelectedScriptVersion(cached)
      setScriptVersionLoading(false)
      return
    }
    setScriptVersionLoading(true)
    logDirectorClientEvent('script_version.load.started', { projectId, versionId, requestSequence })
    try {
      const version = await apiClient.getDirectorScriptVersion(projectId, versionId)
      scriptVersionCacheRef.current.set(version.id, version)
      if (requestSequence !== scriptVersionRequestRef.current) {
        logDirectorClientEvent('script_version.load.stale_response', { projectId, versionId, requestSequence })
        return
      }
      setSelectedScriptVersion(version)
      setScriptVersionsError(undefined)
      logDirectorClientEvent('script_version.load.succeeded', { projectId, versionId, requestSequence, version: version.version })
    } catch (error) {
      if (requestSequence !== scriptVersionRequestRef.current) return
      setScriptVersionsError('该历史版本暂时无法加载，请稍后重试。')
      logDirectorClientEvent('script_version.load.failed', {
        projectId,
        versionId,
        requestSequence,
        ...directorClientErrorMeta(error),
      })
    } finally {
      if (requestSequence === scriptVersionRequestRef.current) setScriptVersionLoading(false)
    }
  }

  useEffect(() => {
    if (boundReferenceAssetIds.length > 0) void loadReferenceAssets(boundReferenceAssetIds)
  }, [boundReferenceAssetIds.join('|'), loadReferenceAssets])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    if (analysisModelId.length > 0 && textModels.some(model => model.id === analysisModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setAnalysisModelId(preferred.id)
  }, [analysisModelId, textModels])

  useEffect(() => {
    if (charactersModelId.length > 0 && textModels.some(model => model.id === charactersModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setCharactersModelId(preferred.id)
  }, [charactersModelId, textModels])

  useEffect(() => {
    if (locationsModelId.length > 0 && textModels.some(model => model.id === locationsModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setLocationsModelId(preferred.id)
  }, [locationsModelId, textModels])

  useEffect(() => {
    if (storyboardModelId.length > 0 && textModels.some(model => model.id === storyboardModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setStoryboardModelId(preferred.id)
  }, [storyboardModelId, textModels])

  useEffect(() => {
    if (continuityModelId.length > 0 && textModels.some(model => model.id === continuityModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setContinuityModelId(preferred.id)
  }, [continuityModelId, textModels])

  useEffect(() => {
    if (promptRebuildModelId.length > 0 && textModels.some(model => model.id === promptRebuildModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setPromptRebuildModelId(preferred.id)
  }, [promptRebuildModelId, textModels])

  useEffect(() => {
    if (dialogueModelId.length > 0 && textModels.some(model => model.id === dialogueModelId)) return
    const preferred = textModels.find(model => model.id === 'qwen-plus') ?? textModels[0]
    if (preferred !== undefined) setDialogueModelId(preferred.id)
  }, [dialogueModelId, textModels])

  useEffect(() => {
    if (videoModelId.length > 0 && videoModels.some(model => model.id === videoModelId)) return
    const preferred = videoModels.find(model => model.id === 'wanx-2.7-reference-video') ?? videoModels[0]
    if (preferred !== undefined) setVideoModelId(preferred.id)
  }, [videoModelId, videoModels])

  useEffect(() => {
    if (musicModelId.length > 0 && musicModels.some(model => model.id === musicModelId)) return
    if (musicModels[0] !== undefined) setMusicModelId(musicModels[0].id)
  }, [musicModelId, musicModels])

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    setLoading(true)
    void apiClient.getDirectorProject(id)
      .then(next => {
        if (cancelled) return
        setProject(next)
        scriptVersionCacheRef.current = new Map([[next.scriptVersion.id, next.scriptVersion]])
        setSelectedScriptVersion(next.scriptVersion)
        setScriptVersions([])
        setScriptVersionsError(undefined)
        scriptVersionRequestRef.current += 1
        setTitle(next.title)
        setStoryText(next.storyText)
        setSynopsis(next.synopsis ?? '')
        setActiveRunId(undefined)
        setActivePhase(undefined)
        setAnalysisText(undefined)
        setAnalysisResult(undefined)
        setAnalysisStale(false)
        setScriptMessages([])
        setPendingScriptMessage(undefined)
        setScriptMessagesError(undefined)
        scriptMessagesRequestRef.current += 1
        setScriptMessage('')
        setCharactersText(undefined)
        setCharactersResult(undefined)
        setCharactersStale(false)
        setLocationsText(undefined)
        setLocationsResult(undefined)
        setLocationsStale(false)
        setContinuityText(undefined)
        setContinuityResult(undefined)
        setContinuityStale(false)
        setPromptRebuildText(undefined)
        setPromptRebuildResult(undefined)
        setPromptRebuildStale(false)
        setAppliedPromptShotIds(new Set())
        setApplyingPromptShotId(undefined)
        setDialogueText(undefined)
        setDialogueResult(undefined)
        setDialogueStale(false)
        setAppliedDialogueShotIds(new Set())
        setApplyingDialogueShotId(undefined)
        setAssemblyPreflight(undefined)
        setAssemblyConfirmOpen(false)
        setReferencePickerOpen(false)
        setReferenceTarget(undefined)
        void reloadScriptMessages(id, 'project-load')
        void reloadScriptVersions(id, 'project-load')
        const analysisState = next.phases.find(state => state.phase === 'analyze')
        const charactersState = next.phases.find(state => state.phase === 'characters')
        const locationsState = next.phases.find(state => state.phase === 'locations')
        const continuityState = next.phases.find(state => state.phase === 'continuity')
        const promptRebuildState = next.phases.find(state => state.phase === 'rebuild')
        const dialogueState = next.phases.find(state => state.phase === 'dialogue')
        if (analysisState?.status === 'queued' || analysisState?.status === 'running') {
          setActiveRunId(analysisState.activeRunId ?? undefined)
          setActivePhase('analyze')
        } else if (charactersState?.status === 'queued' || charactersState?.status === 'running') {
          setActiveRunId(charactersState.activeRunId ?? undefined)
          setActivePhase('characters')
        } else if (locationsState?.status === 'queued' || locationsState?.status === 'running') {
          setActiveRunId(locationsState.activeRunId ?? undefined)
          setActivePhase('locations')
        } else {
          const storyboardState = next.phases.find(state => state.phase === 'storyboard')
          if (storyboardState?.status === 'queued' || storyboardState?.status === 'running') {
            setActiveRunId(storyboardState.activeRunId ?? undefined)
            setActivePhase('storyboard')
          } else {
            const videosState = next.phases.find(state => state.phase === 'videos')
            if (videosState?.status === 'queued' || videosState?.status === 'running') {
              setActiveRunId(videosState.activeRunId ?? undefined)
              setActivePhase('videos')
            }
          }
        }
        const activeState = next.phases.find(state => state.status === 'queued' || state.status === 'running')
        if (activeState !== undefined) {
          setActiveRunId(activeState.activeRunId ?? activeState.lastRunId ?? undefined)
          setActivePhase(activeState.phase)
        }
        if (analysisState?.lastRunId !== null && analysisState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'analyze', analysisState.lastRunId)
            .then(run => {
              if (!cancelled && run.status === 'succeeded' && typeof run.outputSummary?.analysisText === 'string') {
                setAnalysisText(run.outputSummary.analysisText)
                setAnalysisStale(run.staleAt !== null)
                const parsed = DirectorAnalysisResultSchema.safeParse(run.outputSummary.analysis)
                if (parsed.success) setAnalysisResult(parsed.data)
              }
            })
            .catch(() => {})
        }
        if (charactersState?.lastRunId !== null && charactersState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'characters', charactersState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              if (typeof run.outputSummary?.charactersText === 'string') setCharactersText(run.outputSummary.charactersText)
              setCharactersStale(run.staleAt !== null)
              const parsed = DirectorCharactersResultSchema.safeParse(run.outputSummary?.characters)
              if (parsed.success) setCharactersResult(parsed.data)
            })
            .catch(() => {})
        }
        if (locationsState?.lastRunId !== null && locationsState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'locations', locationsState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              if (typeof run.outputSummary?.locationsText === 'string') setLocationsText(run.outputSummary.locationsText)
              setLocationsStale(run.staleAt !== null)
              const parsed = DirectorLocationsResultSchema.safeParse(run.outputSummary?.locations)
              if (parsed.success) setLocationsResult(parsed.data)
            })
            .catch(() => {})
        }
        if (continuityState?.lastRunId !== null && continuityState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'continuity', continuityState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              if (typeof run.outputSummary?.continuityText === 'string') setContinuityText(run.outputSummary.continuityText)
              setContinuityStale(run.staleAt !== null)
              const parsed = DirectorContinuityResultSchema.safeParse(run.outputSummary?.continuity)
              if (parsed.success) setContinuityResult(parsed.data)
            })
            .catch(() => {})
        }
        if (promptRebuildState?.lastRunId !== null && promptRebuildState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'rebuild', promptRebuildState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              if (typeof run.outputSummary?.promptRebuildText === 'string') setPromptRebuildText(run.outputSummary.promptRebuildText)
              setPromptRebuildStale(run.staleAt !== null)
              const parsed = DirectorPromptRebuildResultSchema.safeParse(run.outputSummary?.promptRebuild)
              if (parsed.success) setPromptRebuildResult(parsed.data)
            })
            .catch(() => {})
        }
        if (dialogueState?.lastRunId !== null && dialogueState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'dialogue', dialogueState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              if (typeof run.outputSummary?.dialogueText === 'string') setDialogueText(run.outputSummary.dialogueText)
              setDialogueStale(run.staleAt !== null)
              const parsed = DirectorDialogueResultSchema.safeParse(run.outputSummary?.dialogue)
              if (parsed.success) setDialogueResult(parsed.data)
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setError('项目不存在，或你没有访问权限。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      scriptMessagesRequestRef.current += 1
      scriptVersionsRequestRef.current += 1
      scriptVersionRequestRef.current += 1
    }
  }, [id])

  useEffect(() => {
    if (id === undefined || activeRunId === undefined || activePhase === undefined) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let pollErrorLogged = false
    const poll = async () => {
      try {
        const run = await apiClient.getDirectorPhaseRun(id, activePhase, activeRunId)
        if (cancelled) return
        if (pollErrorLogged) {
          logDirectorClientEvent('phase.poll.recovered', { projectId: id, phase: activePhase, phaseRunId: activeRunId })
          pollErrorLogged = false
        }
        if (activePhase === 'videos') {
          setProject(current => current === undefined ? current : applyDirectorVideoProgress(current, run.outputSummary))
        }
        if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
          const next = await apiClient.getDirectorProject(id)
          if (cancelled) return
          setProject(next)
          if (activePhase === 'analyze') {
            scriptVersionCacheRef.current.set(next.scriptVersion.id, next.scriptVersion)
            setSelectedScriptVersion(next.scriptVersion)
            void reloadScriptVersions(id, 'analysis-terminal')
            setTitle(next.title)
            setStoryText(next.storyText)
            setSynopsis(next.synopsis ?? '')
            void reloadScriptMessages(id, 'analysis-terminal')
            setPendingScriptMessage(current => {
              if (current?.runId !== activeRunId || run.status === 'succeeded') return current
              return { ...current, deliveryStatus: 'failed' }
            })
          }
          if (run.status === 'succeeded' && activePhase === 'analyze') {
            if (typeof run.outputSummary?.analysisText === 'string') setAnalysisText(run.outputSummary.analysisText)
            setAnalysisStale(false)
            const parsed = DirectorAnalysisResultSchema.safeParse(run.outputSummary?.analysis)
            if (parsed.success) setAnalysisResult(parsed.data)
          }
          if (run.status === 'succeeded' && activePhase === 'characters') {
            if (typeof run.outputSummary?.charactersText === 'string') setCharactersText(run.outputSummary.charactersText)
            setCharactersStale(false)
            const parsed = DirectorCharactersResultSchema.safeParse(run.outputSummary?.characters)
            if (parsed.success) setCharactersResult(parsed.data)
          }
          if (run.status === 'succeeded' && activePhase === 'locations') {
            if (typeof run.outputSummary?.locationsText === 'string') setLocationsText(run.outputSummary.locationsText)
            setLocationsStale(false)
            const parsed = DirectorLocationsResultSchema.safeParse(run.outputSummary?.locations)
            if (parsed.success) setLocationsResult(parsed.data)
          }
          if (run.status === 'succeeded' && activePhase === 'continuity') {
            if (typeof run.outputSummary?.continuityText === 'string') setContinuityText(run.outputSummary.continuityText)
            setContinuityStale(false)
            const parsed = DirectorContinuityResultSchema.safeParse(run.outputSummary?.continuity)
            if (parsed.success) setContinuityResult(parsed.data)
          }
          if (run.status === 'succeeded' && activePhase === 'rebuild') {
            if (typeof run.outputSummary?.promptRebuildText === 'string') setPromptRebuildText(run.outputSummary.promptRebuildText)
            setPromptRebuildStale(false)
            setAppliedPromptShotIds(new Set())
            const parsed = DirectorPromptRebuildResultSchema.safeParse(run.outputSummary?.promptRebuild)
            if (parsed.success) setPromptRebuildResult(parsed.data)
          }
          if (run.status === 'succeeded' && activePhase === 'dialogue') {
            if (typeof run.outputSummary?.dialogueText === 'string') setDialogueText(run.outputSummary.dialogueText)
            setDialogueStale(false)
            setAppliedDialogueShotIds(new Set())
            const parsed = DirectorDialogueResultSchema.safeParse(run.outputSummary?.dialogue)
            if (parsed.success) setDialogueResult(parsed.data)
          }
          setActiveRunId(undefined)
          setActivePhase(undefined)
          logDirectorClientEvent('phase.poll.terminal', {
            projectId: id,
            phase: activePhase,
            phaseRunId: activeRunId,
            status: run.status,
            errorCode: typeof run.error?.code === 'string' ? run.error.code : undefined,
            errorMessage: typeof run.error?.message === 'string' ? run.error.message : undefined,
          })
          const phaseLabel = activePhase === 'assemble'
            ? DIRECTOR_PHASE_LABELS.assemble
            : activePhase === 'analyze'
            ? '剧本分析'
            : activePhase === 'characters'
              ? '角色阶段'
              : activePhase === 'locations'
                ? '场景阶段'
                : activePhase === 'storyboard'
                  ? '分镜阶段'
                  : activePhase === 'continuity'
                    ? '连续性检查'
                    : activePhase === 'rebuild'
                      ? '视频提示词重建'
                      : activePhase === 'dialogue'
                        ? '对白整理'
                        : '视频生成阶段'
          toast[run.status === 'succeeded' ? 'success' : 'error'](run.status === 'succeeded'
            ? `${phaseLabel}已完成`
            : `${phaseLabel}未完成，请查看阶段状态`)
          return
        }
        timer = setTimeout(() => void poll(), 2_000)
      } catch (error) {
        if (!pollErrorLogged) {
          logDirectorClientEvent('phase.poll.failed', {
            projectId: id,
            phase: activePhase,
            phaseRunId: activeRunId,
            ...directorClientErrorMeta(error),
          })
          pollErrorLogged = true
        }
        if (!cancelled) timer = setTimeout(() => void poll(), 4_000)
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [activePhase, activeRunId, id])

  const progress = useMemo(() => {
    if (project === undefined) return { completed: 0, total: DIRECTOR_PHASES.length }
    return {
      completed: project.phases.filter(state => state.status === 'completed').length,
      total: project.phases.length,
    }
  }, [project])

  const dirty = project !== undefined && (title !== project.title || storyText !== project.storyText || synopsis !== (project.synopsis ?? ''))
  const isHistoricalScriptVersion = project !== undefined
    && selectedScriptVersion !== undefined
    && selectedScriptVersion.id !== project.scriptVersion.id

  const runAnalysis = async () => {
    if (id === undefined || analysisModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'analyze', { modelId: analysisModelId })
      setActiveRunId(run.id)
      setActivePhase('analyze')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'analyze'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('剧本分析已加入执行队列')
    } catch {
      toast.error('无法启动剧本分析，请确认阶段已准备好')
    } finally {
      setSaving(false)
    }
  }

  const sendScriptMessage = async () => {
    const message = scriptMessage.trim()
    if (id === undefined || analysisModelId.length === 0 || message.length === 0 || activeRunId !== undefined || isHistoricalScriptVersion) return
    const clientMessageId = `client-${crypto.randomUUID()}`
    setPendingScriptMessage({
      id: clientMessageId,
      role: 'user',
      content: message,
      scriptVersion: project?.scriptVersion.version ?? 1,
      runId: null,
      createdAt: new Date().toISOString(),
      deliveryStatus: 'queued',
    })
    setScriptMessage('')
    logDirectorClientEvent('script_chat.send.started', {
      projectId: id,
      modelId: analysisModelId,
      messageLength: message.length,
      clientMessageId,
    })
    try {
      const run = await apiClient.requestDirectorScriptChat(id, { modelId: analysisModelId, message })
      setPendingScriptMessage(current => current?.id === clientMessageId ? { ...current, runId: run.id } : current)
      void reloadScriptMessages(id, 'chat-queued')
      setActiveRunId(run.id)
      setActivePhase('analyze')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'analyze'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      logDirectorClientEvent('script_chat.send.queued', {
        projectId: id,
        phaseRunId: run.id,
        taskId: run.taskId,
        clientMessageId,
      })
    } catch (error) {
      setPendingScriptMessage(current => current?.id === clientMessageId ? { ...current, deliveryStatus: 'failed' } : current)
      setScriptMessage(message)
      logDirectorClientEvent('script_chat.send.failed', {
        projectId: id,
        modelId: analysisModelId,
        messageLength: message.length,
        clientMessageId,
        ...directorClientErrorMeta(error),
      })
      toast.error('无法发送剧本修改，请稍后重试')
    }
  }

  const runCharacters = async () => {
    if (id === undefined || charactersModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'characters', { modelId: charactersModelId })
      setActiveRunId(run.id)
      setActivePhase('characters')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'characters'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('角色阶段已加入执行队列')
    } catch {
      toast.error('无法启动角色阶段，请确认剧本分析已完成')
    } finally {
      setSaving(false)
    }
  }

  const runLocations = async () => {
    if (id === undefined || locationsModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'locations', { modelId: locationsModelId })
      setActiveRunId(run.id)
      setActivePhase('locations')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'locations'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('场景阶段已加入执行队列')
    } catch {
      toast.error('无法启动场景阶段，请确认角色阶段已完成')
    } finally {
      setSaving(false)
    }
  }

  const runStoryboard = async () => {
    if (id === undefined || storyboardModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'storyboard', { modelId: storyboardModelId })
      setActiveRunId(run.id)
      setActivePhase('storyboard')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'storyboard'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('分镜阶段已加入执行队列')
    } catch {
      toast.error('无法启动分镜阶段，请确认分析、角色和场景都已完成')
    } finally {
      setSaving(false)
    }
  }

  const runContinuity = async () => {
    if (id === undefined || continuityModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'continuity', { modelId: continuityModelId })
      setActiveRunId(run.id)
      setActivePhase('continuity')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'continuity'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('连续性检查已加入执行队列')
    } catch {
      toast.error('无法启动连续性检查，请确认分镜已经生成')
    } finally {
      setSaving(false)
    }
  }

  const runPromptRebuild = async () => {
    if (id === undefined || promptRebuildModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'rebuild', { modelId: promptRebuildModelId })
      setActiveRunId(run.id)
      setActivePhase('rebuild')
      setPromptRebuildText(undefined)
      setPromptRebuildResult(undefined)
      setPromptRebuildStale(false)
      setAppliedPromptShotIds(new Set())
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'rebuild'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('视频提示词重建已加入执行队列')
    } catch {
      toast.error('无法启动视频提示词重建，请确认当前分镜已经生成')
    } finally {
      setSaving(false)
    }
  }

  const applyPromptSuggestion = async (shotId: string, patch: UpdateDirectorShotInput) => {
    if (id === undefined) return
    setApplyingPromptShotId(shotId)
    try {
      const shot = await apiClient.updateDirectorShot(id, shotId, patch)
      setProject(current => current === undefined
        ? current
        : { ...current, shots: current.shots.map(candidate => candidate.id === shot.id ? shot : candidate) })
      setAppliedPromptShotIds(current => new Set(current).add(shotId))
      toast.success(`镜头 ${String(shot.sequence).padStart(2, '0')} 的提示词已应用，请重新审核并锁定`)
    } catch {
      toast.error('提示词应用失败，请确认镜头未锁定且仍属于当前分镜')
    } finally {
      setApplyingPromptShotId(undefined)
    }
  }

  const runDialogue = async () => {
    if (id === undefined || dialogueModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'dialogue', { modelId: dialogueModelId })
      setActiveRunId(run.id)
      setActivePhase('dialogue')
      setDialogueText(undefined)
      setDialogueResult(undefined)
      setDialogueStale(false)
      setAppliedDialogueShotIds(new Set())
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'dialogue'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('对白整理已加入执行队列')
    } catch {
      toast.error('无法启动对白整理，请确认当前分镜已经生成')
    } finally {
      setSaving(false)
    }
  }

  const applyDialogueSuggestion = async (shotId: string, lines: Array<{ speaker: string; text: string; delivery: string }>) => {
    if (id === undefined) return
    const shot = project?.shots.find(candidate => candidate.id === shotId)
    if (shot === undefined) return
    setApplyingDialogueShotId(shotId)
    try {
      const updated = await apiClient.updateDirectorShot(id, shotId, { expectedVersion: shot.version, dialogue: { lines } })
      setProject(current => current === undefined
        ? current
        : { ...current, shots: current.shots.map(candidate => candidate.id === updated.id ? updated : candidate) })
      setAppliedDialogueShotIds(current => new Set(current).add(shotId))
      toast.success(`镜头 ${String(updated.sequence).padStart(2, '0')} 的对白已应用，请重新审核并锁定`)
    } catch {
      toast.error('对白应用失败，请确认镜头未锁定且仍属于当前分镜')
    } finally {
      setApplyingDialogueShotId(undefined)
    }
  }

  const prepareMusicRun = async () => {
    const duration = Number.parseInt(musicDuration, 10)
    if (id === undefined || musicModelId.length === 0 || musicPrompt.trim().length === 0 || !Number.isInteger(duration) || duration < 1 || dirty || activeRunId !== undefined || musicEstimating || musicConfirmOpen) return
    setMusicEstimating(true)
    try {
      const estimate = await apiClient.estimateDirectorMusic(id, {
        modelId: musicModelId,
        prompt: musicPrompt.trim(),
        isInstrumental: true,
        duration,
      })
      setMusicEstimate(estimate)
      setMusicConfirmOpen(true)
    } catch {
      toast.error('无法估算音乐费用，请确认音乐描述和模型配置')
    } finally {
      setMusicEstimating(false)
    }
  }

  const confirmMusicRun = async () => {
    const duration = Number.parseInt(musicDuration, 10)
    if (id === undefined || musicModelId.length === 0 || musicPrompt.trim().length === 0 || !Number.isInteger(duration)) return
    setMusicConfirmOpen(false)
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'bgm', {
        modelId: musicModelId,
        prompt: musicPrompt.trim(),
        isInstrumental: true,
        duration,
      })
      setActiveRunId(run.id)
      setActivePhase('bgm')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'bgm'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('音乐生成已加入执行队列')
    } catch {
      toast.error('无法启动音乐生成，请确认当前阶段已准备好')
    } finally {
      setSaving(false)
    }
  }

  const readAssemblySettings = () => {
    const width = Number.parseInt(assemblyWidth, 10)
    const height = Number.parseInt(assemblyHeight, 10)
    const fps = Number.parseInt(assemblyFps, 10)
    const audioVolume = Number.parseFloat(assemblyAudioVolume)
    if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(fps) || !Number.isFinite(audioVolume)) return undefined
    if (width < 360 || width > 2160 || height < 360 || height > 3840 || fps < 12 || fps > 60 || audioVolume < 0 || audioVolume > 2) return undefined
    return { width, height, fps, audioVolume }
  }

  const prepareAssemblyRun = async () => {
    const settings = readAssemblySettings()
    if (id === undefined || settings === undefined || dirty || activeRunId !== undefined || assemblyPreflighting || assemblyConfirmOpen) {
      if (settings === undefined) toast.error('请检查合成参数范围')
      return
    }
    setAssemblyPreflighting(true)
    try {
      const preflight = await apiClient.getDirectorAssemblyPreflight(id, { assembly: settings })
      setAssemblyPreflight(preflight)
      if (!preflight.ready) {
        toast.error(preflight.issues[0]?.message ?? '当前镜头还不能合成')
        return
      }
      setAssemblyConfirmOpen(true)
    } catch {
      toast.error('合成预检失败，请确认视频镜头已经完成并重试')
    } finally {
      setAssemblyPreflighting(false)
    }
  }

  const confirmAssemblyRun = async () => {
    const settings = readAssemblySettings()
    if (id === undefined || settings === undefined || assemblyPreflight?.ready !== true || dirty || activeRunId !== undefined) return
    setAssemblyConfirmOpen(false)
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'assemble', { assembly: settings })
      setActiveRunId(run.id)
      setActivePhase('assemble')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'assemble'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('合成任务已加入执行队列')
    } catch {
      toast.error('合成任务启动失败，请重新执行预检')
    } finally {
      setSaving(false)
    }
  }

  const confirmVideoRun = async () => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined) return
    const retryShotId = videoRetryShotId
    setVideoConfirmOpen(false)
    if (retryShotId !== undefined) setVideoRetryingShotId(retryShotId)
    setSaving(true)
    try {
      const run = retryShotId === undefined
        ? await apiClient.requestDirectorPhaseRun(id, 'videos', { modelId: videoModelId })
        : await apiClient.requestDirectorShotVideoRun(id, retryShotId, { modelId: videoModelId })
      setActiveRunId(run.id)
      setActivePhase('videos')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: current.phases.map(state => state.phase === 'videos'
          ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
          : state),
      })
      toast.success('视频生成已加入执行队列')
    } catch {
      toast.error('无法启动视频生成，请确认所有分镜已锁定')
    } finally {
      setSaving(false)
      setVideoRetryingShotId(undefined)
      setVideoRetryShotId(undefined)
    }
  }

  const prepareVideoRun = async () => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined) return
    setVideoRetryShotId(undefined)
    setVideoEstimating(true)
    try {
      const estimate = await apiClient.estimateDirectorVideoPhase(id, { modelId: videoModelId })
      setVideoEstimate(estimate)
      if (estimate.shotCount === 0) {
        toast.success('当前没有需要新生成的视频镜头')
      } else {
        setVideoConfirmOpen(true)
      }
    } catch {
      toast.error('暂时无法估算视频成本，请确认所有分镜已锁定')
    } finally {
      setVideoEstimating(false)
    }
  }

  const prepareShotRetry = async (shotId: string) => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined || videoConfirmOpen || videoEstimating || videoRetryingShotId !== undefined) return
    setVideoRetryingShotId(shotId)
    try {
      const estimate = await apiClient.estimateDirectorShotVideo(id, shotId, { modelId: videoModelId })
      setVideoRetryShotId(shotId)
      setVideoEstimate(estimate)
      setVideoConfirmOpen(true)
    } catch {
      setVideoRetryShotId(undefined)
      toast.error('暂时无法估算单镜重试成本，请确认镜头仍处于失败状态')
    } finally {
      setVideoRetryingShotId(undefined)
    }
  }

  const saveProject = async () => {
    if (id === undefined || !dirty || title.trim().length === 0 || storyText.trim().length === 0) return
    setSaving(true)
    try {
      const next = await apiClient.updateDirectorProject(id, {
        title: title.trim(),
        storyText: storyText.trim(),
        synopsis: synopsis.trim().length > 0 ? synopsis.trim() : null,
      })
      setProject(next)
      setTitle(next.title)
      setStoryText(next.storyText)
      setSynopsis(next.synopsis ?? '')
      if (analysisText !== undefined || analysisResult !== undefined) setAnalysisStale(true)
      if (charactersText !== undefined || charactersResult !== undefined) setCharactersStale(true)
      if (locationsText !== undefined || locationsResult !== undefined) setLocationsStale(true)
      toast.success('项目基础信息已保存')
    } catch {
      toast.error('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const openReferencePicker = (target: ReferenceTarget) => {
    setReferenceTarget(target)
    setReferencePickerOpen(true)
  }

  const attachReferenceAsset = async (assets: AssetItem[]) => {
    const asset = assets[0]
    if (id === undefined || referenceTarget === undefined || asset === undefined) return
    setSaving(true)
    try {
      await apiClient.attachDirectorAsset(id, {
        assetId: asset.id,
        kind: referenceTarget.ownerType === 'character' ? 'character_reference' : 'location_reference',
        ownerType: referenceTarget.ownerType,
        ownerId: referenceTarget.ownerId,
      })
      const next = await apiClient.getDirectorProject(id)
      setProject(next)
      void loadReferenceAssets([asset.id])
      toast.success('参考资产已绑定到当前项目')
    } catch {
      toast.error('参考资产绑定失败，请稍后重试')
    } finally {
      setSaving(false)
      setReferencePickerOpen(false)
      setReferenceTarget(undefined)
    }
  }

  const detachReferenceAsset = async (asset: DirectorAsset) => {
    if (id === undefined) return
    setSaving(true)
    try {
      const next = await apiClient.detachDirectorAsset(id, asset.id)
      setProject(next)
      toast.success('已移除导演台引用，原始资产仍保留在资产库')
    } catch {
      toast.error('移除引用失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const updateStoryboardShot = async (shotId: string, input: UpdateDirectorShotInput) => {
    if (id === undefined) return
    setSaving(true)
    try {
      const nextShot = await apiClient.updateDirectorShot(id, shotId, input)
      setProject(current => current === undefined ? current : {
        ...current,
        shots: current.shots.map(shot => shot.id === nextShot.id ? nextShot : shot),
      })
      toast.success(input.status === 'locked' ? '镜头已锁定' : input.status === 'needs_review' ? '镜头已解锁' : '镜头修改已保存')
    } catch {
      toast.error('镜头保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </main>
    )
  }

  if (project === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-12 sm:px-6">
        <Button variant="ghost" onClick={() => navigate('/director')}>
          <ArrowLeft data-icon="inline-start" /> 返回导演台
        </Button>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{error ?? '项目加载失败'}</h1>
          <p className="text-sm text-muted-foreground">请返回项目列表后重新进入。</p>
        </div>
      </main>
    )
  }

  const assemblyState = phaseStateFor(project, ['assemble'])
  const displayedScriptVersion = selectedScriptVersion ?? project.scriptVersion
  const latestFinalVideo = project.assets.find(asset => asset.kind === 'final_video' && asset.staleAt === null)
  const latestFinalVideoAsset = latestFinalVideo?.assetId === null || latestFinalVideo?.assetId === undefined
    ? undefined
    : referenceAssets[latestFinalVideo.assetId]

  return (
    <>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/director')}>
            <ArrowLeft data-icon="inline-start" /> 导演台项目
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{project.status === 'draft' ? '草稿' : project.status}</Badge>
            <Badge variant="secondary">剧本 v{project.scriptVersion.version}</Badge>
            {dirty && <span className="text-xs text-muted-foreground">有未保存修改</span>}
            <Button className="hidden" size="sm" onClick={() => void saveProject()} disabled={!dirty || saving}>
              {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              保存
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              <span>手动制作项目</span>
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{project.synopsis ?? '还没有项目简介，先从剧本分析开始。'}</p>
          </div>
          <div className="flex min-w-52 flex-col gap-2 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>总体进度</span>
              <span className="tabular-nums text-foreground">{progress.completed}/{progress.total}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: progress.total }, (_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-full ${index < progress.completed ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <Separator />

      <Tabs defaultValue="analyze" className="min-w-0">
        <TabsList variant="line" className="w-full flex-wrap justify-start gap-2 overflow-x-auto py-1">
          {TAB_ITEMS.map(tab => {
            const state = phaseStateFor(project, tab.phases)
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-2.5">
                {state?.status === 'completed' ? <Check data-icon="inline-start" /> : <CircleDashed data-icon="inline-start" />}
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="analyze" className="mt-6">
          <ScreenplayChatWorkspace
            messages={scriptMessages}
            pendingMessage={pendingScriptMessage}
            historyError={scriptMessagesError}
            onRetryHistory={() => { if (id !== undefined) void reloadScriptMessages(id, 'manual-retry') }}
            screenplay={displayedScriptVersion.storyText}
            scriptVersion={displayedScriptVersion.version}
            scriptVersionId={displayedScriptVersion.id}
            currentScriptVersionId={project.scriptVersion.id}
            scriptVersions={scriptVersions}
            scriptVersionsLoading={scriptVersionsLoading}
            scriptVersionLoading={scriptVersionLoading}
            scriptVersionsError={scriptVersionsError}
            onSelectScriptVersion={versionId => { if (id !== undefined) void selectScriptVersion(id, versionId) }}
            analysis={analysisResult}
            analysisStale={analysisStale}
            modelId={analysisModelId}
            textModels={textModels}
            message={scriptMessage}
            running={activePhase === 'analyze' && activeRunId !== undefined}
            onModelChange={setAnalysisModelId}
            onMessageChange={setScriptMessage}
            onSend={() => void sendScriptMessage()}
          />
          <div className="hidden grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold">原始剧本</h2>
                  <p className="text-sm leading-6 text-muted-foreground">这是后续角色、场景和分镜阶段的唯一输入源。修改后，相关阶段需要重新确认。</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <label htmlFor="director-project-title" className="flex flex-col gap-2 text-sm font-medium">
                  项目名称
                  <Input id="director-project-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} />
                </label>
                <label htmlFor="director-project-synopsis" className="flex flex-col gap-2 text-sm font-medium">
                  一句话简介
                  <Input id="director-project-synopsis" value={synopsis} onChange={event => setSynopsis(event.target.value)} placeholder="可选" maxLength={2_000} />
                </label>
                <label htmlFor="director-project-story" className="flex flex-col gap-2 text-sm font-medium">
                  故事原文
                  <Textarea id="director-project-story" value={storyText} onChange={event => setStoryText(event.target.value)} className="min-h-96 resize-y leading-7" maxLength={500_000} />
                </label>
              </div>
              {analysisText !== undefined && (
                <AnalysisReview result={analysisResult} rawText={analysisText} stale={analysisStale} />
              )}
              {analysisText === undefined && analysisResult !== undefined && (
                <AnalysisReview result={analysisResult} stale={analysisStale} />
              )}
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['analyze']}
              modelId={analysisModelId}
              textModels={textModels}
              running={activeRunId !== undefined}
              onModelChange={setAnalysisModelId}
              onRunPhase={() => void runAnalysis()}
              runLabel="开始剧本分析"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="characters" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">角色资产</span>
                <h2 className="text-xl font-semibold">把分析里的角色变成可持续维护的角色卡</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">本阶段只消费已确认的剧本分析，输出人物目标、冲突、弧线和视觉特征，供后续参考资产、分镜和对白阶段复用。</p>
              </div>
              {charactersText !== undefined && <CharactersReview result={charactersResult} rawText={charactersText} stale={charactersStale} />}
              {charactersText === undefined && charactersResult !== undefined && <CharactersReview result={charactersResult} stale={charactersStale} />}
              {charactersText === undefined && charactersResult === undefined && (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
                  <p className="font-medium">角色阶段尚未生成结果</p>
                  <p className="text-sm leading-6 text-muted-foreground">完成剧本分析后，在右侧选择模型并手动启动。</p>
                </div>
              )}
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['characters']}
              modelId={charactersModelId}
              textModels={textModels}
              running={activePhase === 'characters' && activeRunId !== undefined}
              onModelChange={setCharactersModelId}
              onRunPhase={() => void runCharacters()}
              runLabel="生成角色卡"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">场景资产</span>
                <h2 className="text-xl font-semibold">把故事空间变成可复用的场景卡</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">本阶段消费剧本分析和角色卡，整理叙事功能、时间、氛围、视觉锚点与连续性约束，供参考资产和分镜阶段复用。</p>
              </div>
              {locationsText !== undefined && <LocationsReview result={locationsResult} rawText={locationsText} stale={locationsStale} />}
              {locationsText === undefined && locationsResult !== undefined && <LocationsReview result={locationsResult} stale={locationsStale} />}
              {locationsText === undefined && locationsResult === undefined && (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
                  <p className="font-medium">场景阶段尚未生成结果</p>
                  <p className="text-sm leading-6 text-muted-foreground">完成角色阶段后，在右侧选择模型并手动启动。</p>
                </div>
              )}
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['locations']}
              modelId={locationsModelId}
              textModels={textModels}
              running={activePhase === 'locations' && activeRunId !== undefined}
              onModelChange={setLocationsModelId}
              onRunPhase={() => void runLocations()}
              runLabel="生成场景卡"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="references" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">手动确认</span>
                <h2 className="text-xl font-semibold">为角色和场景挑选参考资产</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">这里绑定的是资产库里的现有图片。绑定关系可以随时替换或移除，移除不会删除原始资产；后续生成出的参考图也会沿用这套关系和失效标记。</p>
              </div>
              {project.characters.filter(character => character.staleAt === null).length > 0 && (
                <ReferenceEntityGroup
                  title="角色参考"
                  ownerType="character"
                  entities={project.characters.filter(character => character.staleAt === null).map(character => ({ id: character.id, name: character.name, subtitle: character.role }))}
                  bindings={project.assets}
                  assetItems={referenceAssets}
                  saving={saving}
                  onAdd={openReferencePicker}
                  onRemove={asset => void detachReferenceAsset(asset)}
                />
              )}
              {project.locations.filter(location => location.staleAt === null).length > 0 && (
                <ReferenceEntityGroup
                  title="场景参考"
                  ownerType="location"
                  entities={project.locations.filter(location => location.staleAt === null).map(location => ({ id: location.id, name: location.name, subtitle: location.atmosphere }))}
                  bindings={project.assets}
                  assetItems={referenceAssets}
                  saving={saving}
                  onAdd={openReferencePicker}
                  onRemove={asset => void detachReferenceAsset(asset)}
                />
              )}
              {project.characters.every(character => character.staleAt !== null) && project.locations.every(location => location.staleAt !== null) && (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center">
                  <ImageIcon className="size-8 text-muted-foreground" />
                  <p className="font-medium">还没有可绑定的角色或场景卡</p>
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">先完成角色、场景阶段并确认结果，再在这里手动选择参考图片。</p>
                </div>
              )}
            </section>
            <PhaseStatusPanel project={project} phases={['characterRefs', 'locationRefs']} />
          </div>
        </TabsContent>

        <TabsContent value="storyboard" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">人工审核点</span>
                <h2 className="text-xl font-semibold">把剧本拆成可执行的镜头卡</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">分镜生成只产出草稿，不会自动触发视频任务。生成后请逐镜检查动作、景别、对白和参考资产，再进入后续阶段。</p>
              </div>
              <StoryboardReview project={project} shots={project.shots} assetItems={referenceAssets} saving={saving} onSave={updateStoryboardShot} />
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['storyboard']}
              modelId={storyboardModelId}
              textModels={textModels}
              running={activePhase === 'storyboard' && activeRunId !== undefined}
              onModelChange={setStoryboardModelId}
              onRunPhase={() => void runStoryboard()}
              runLabel="生成分镜草稿"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="continuity" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">人工复核</span>
                <h2 className="text-xl font-semibold">连续性检查</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">检查角色、场景、时间、动作和镜头之间是否存在会影响拍摄或视频生成的衔接风险。结果只作为建议，不会自动修改已审核分镜。</p>
              </div>
              <DirectorContinuityReview result={continuityResult} rawText={continuityText} stale={continuityStale} />
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['continuity']}
              modelId={continuityModelId}
              textModels={textModels}
              running={activePhase === 'continuity' && activeRunId !== undefined}
              onModelChange={setContinuityModelId}
              onRunPhase={() => void runContinuity()}
              runLabel="检查分镜连续性"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">可编辑建议</span>
                <h2 className="text-xl font-semibold">重建视频提示词</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">系统会结合当前分镜和连续性检查结果生成逐镜建议。建议不会自动覆盖分镜，逐项应用后仍需人工复核并重新锁定镜头。</p>
              </div>
              <DirectorPromptRebuildReview
                project={project}
                result={promptRebuildResult}
                rawText={promptRebuildText}
                stale={promptRebuildStale}
                appliedShotIds={appliedPromptShotIds}
                applyingShotId={applyingPromptShotId}
                onApply={(shotId, patch) => void applyPromptSuggestion(shotId, patch)}
              />
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['rebuild']}
              modelId={promptRebuildModelId}
              textModels={textModels}
              running={activePhase === 'rebuild' && activeRunId !== undefined}
              onModelChange={setPromptRebuildModelId}
              onRunPhase={() => void runPromptRebuild()}
              runLabel="重建视频提示词"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="dialogue" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">可编辑建议</span>
                <h2 className="text-xl font-semibold">整理逐镜对白</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">系统会根据当前镜头叙事整理对白、说话人和表演语气。对白建议不会自动覆盖分镜，应用后镜头会回到待审核状态。</p>
              </div>
              <DirectorDialogueReview
                project={project}
                result={dialogueResult}
                rawText={dialogueText}
                stale={dialogueStale}
                appliedShotIds={appliedDialogueShotIds}
                applyingShotId={applyingDialogueShotId}
                onApply={(shotId, lines) => void applyDialogueSuggestion(shotId, lines)}
              />
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['dialogue']}
              modelId={dialogueModelId}
              textModels={textModels}
              running={activePhase === 'dialogue' && activeRunId !== undefined}
              onModelChange={setDialogueModelId}
              onRunPhase={() => void runDialogue()}
              runLabel="整理逐镜对白"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="videos" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">手动执行</span>
                <h2 className="text-xl font-semibold">逐镜头生成视频</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  只会提交当前版本中已经锁定的分镜。每个镜头独立计费、独立追踪，生成中的任务可以离开页面继续执行；重新生成也会保留旧视频并标记为过时。
                </p>
              </div>
              <DirectorVideoShotList
                project={project}
                assetItems={referenceAssets}
                onRetry={shotId => void prepareShotRetry(shotId)}
                retryingShotId={videoRetryingShotId}
              />
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['videos']}
              modelId={videoModelId}
              textModels={videoModels}
              running={videoEstimating || videoConfirmOpen || (activePhase === 'videos' && activeRunId !== undefined)}
              onModelChange={value => {
                setVideoModelId(value)
                setVideoEstimate(undefined)
              }}
              onRunPhase={() => void prepareVideoRun()}
              runLabel="按锁定分镜生成视频"
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        <TabsContent value="bgm" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">费用确认后执行</span>
                <h2 className="text-xl font-semibold">生成背景音乐</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">音乐生成会真实消耗额度。先填写音乐描述并查看预估费用，确认后才会创建任务；新的音乐会保留旧版本并将其标记为过时。</p>
              </div>
              <div className="flex flex-col gap-4 bg-muted/30 px-4 py-4 sm:px-5">
                <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="director-music-prompt">
                  音乐描述
                  <Textarea id="director-music-prompt" className="min-h-28 resize-y leading-6" value={musicPrompt} disabled={musicEstimating || musicConfirmOpen || activeRunId !== undefined} onChange={event => setMusicPrompt(event.target.value)} placeholder="例如：克制、悬疑的钢琴与低频弦乐，适合雨夜追踪场景" />
                </label>
                <label className="flex max-w-xs flex-col gap-2 text-sm font-medium" htmlFor="director-music-duration">
                  费用预估时长（秒）
                  <Input id="director-music-duration" type="number" min={1} max={600} value={musicDuration} disabled={musicEstimating || musicConfirmOpen || activeRunId !== undefined} onChange={event => setMusicDuration(event.target.value)} />
                </label>
                {project.assets.some(asset => asset.kind === 'music' && asset.staleAt === null) && <p className="text-sm leading-6 text-muted-foreground">当前已有可用音乐资产，重新生成后旧资产仍会保留在资产历史中。</p>}
              </div>
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['bgm']}
              modelId={musicModelId}
              textModels={musicModels}
              running={musicEstimating || musicConfirmOpen || (activePhase === 'bgm' && activeRunId !== undefined)}
              onModelChange={value => {
                setMusicModelId(value)
                setMusicEstimate(undefined)
              }}
              onRunPhase={() => void prepareMusicRun()}
              runLabel="生成背景音乐"
              blockedByUnsavedChanges={dirty || musicPrompt.trim().length === 0}
            />
          </div>
        </TabsContent>

        <TabsContent value="assemble" className="mt-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">人工确认 · 最终输出</span>
                <h2 className="text-xl font-semibold">把已确认镜头合成为成片</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  合成只读取当前有效的镜头视频和音乐资产，不会重新生成内容。每次执行都会保存输入快照；如果剧本或镜头发生变化，旧成片会保留并标记为过时。
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-3 bg-muted/30 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">合成清单</span>
                    <span className="text-xs text-muted-foreground">按镜头顺序</span>
                  </div>
                  {assemblyPreflight === undefined ? (
                    <p className="text-sm leading-6 text-muted-foreground">点击右侧“预检并合成”，系统会检查每个镜头是否有可用视频。</p>
                  ) : assemblyPreflight.plan.shots.length === 0 ? (
                    <p className="text-sm leading-6 text-muted-foreground">还没有可用于合成的镜头。</p>
                  ) : (
                    <VirtualScrollArea className="max-h-64">
                      <div className="flex flex-col gap-2 pr-2">
                      {assemblyPreflight.plan.shots.map(shot => (
                        <div key={shot.shotId} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">镜头 {String(shot.sequence).padStart(2, '0')}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{shot.durationSeconds.toFixed(1)}s</span>
                        </div>
                      ))}
                      </div>
                    </VirtualScrollArea>
                  )}
                  {assemblyPreflight?.issues.map(issue => (
                    <div key={`${issue.code}-${issue.shotId ?? 'project'}`} className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span className="leading-6">{issue.message}</span>
                    </div>
                  ))}
                  {assemblyPreflight?.warnings.map(warning => (
                    <p key={warning} className="text-xs leading-5 text-muted-foreground">{warning}</p>
                  ))}
                </div>

                <div className="flex flex-col gap-3 bg-muted/30 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">输出参数</span>
                    <span className="text-xs text-muted-foreground">竖屏默认</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2 text-sm" htmlFor="director-assembly-width">
                      宽度
                      <Input id="director-assembly-width" type="number" min={360} max={2160} value={assemblyWidth} disabled={assemblyPreflighting || assemblyConfirmOpen || activeRunId !== undefined} onChange={event => { setAssemblyWidth(event.target.value); setAssemblyPreflight(undefined) }} />
                    </label>
                    <label className="flex flex-col gap-2 text-sm" htmlFor="director-assembly-height">
                      高度
                      <Input id="director-assembly-height" type="number" min={360} max={3840} value={assemblyHeight} disabled={assemblyPreflighting || assemblyConfirmOpen || activeRunId !== undefined} onChange={event => { setAssemblyHeight(event.target.value); setAssemblyPreflight(undefined) }} />
                    </label>
                    <label className="flex flex-col gap-2 text-sm" htmlFor="director-assembly-fps">
                      帧率
                      <Input id="director-assembly-fps" type="number" min={12} max={60} value={assemblyFps} disabled={assemblyPreflighting || assemblyConfirmOpen || activeRunId !== undefined} onChange={event => { setAssemblyFps(event.target.value); setAssemblyPreflight(undefined) }} />
                    </label>
                    <label className="flex flex-col gap-2 text-sm" htmlFor="director-assembly-volume">
                      音量
                      <Input id="director-assembly-volume" type="number" min={0} max={2} step={0.1} value={assemblyAudioVolume} disabled={assemblyPreflighting || assemblyConfirmOpen || activeRunId !== undefined} onChange={event => { setAssemblyAudioVolume(event.target.value); setAssemblyPreflight(undefined) }} />
                    </label>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">当前有效镜头</span>
                  <span className="tabular-nums">{assemblyPreflight?.plan.shots.length ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">预计时长</span>
                  <span className="tabular-nums">{assemblyPreflight === undefined ? '—' : `${assemblyPreflight.plan.totalDurationSeconds.toFixed(1)} 秒`}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">背景音乐</span>
                  <span>{assemblyPreflight?.plan.music === null ? '无，将保留原镜头画面' : assemblyPreflight?.plan.music === undefined ? '—' : '已加入合成'}</span>
                </div>
              </div>

              {latestFinalVideo !== undefined && (
                <div className="flex flex-col gap-2 bg-primary/5 px-4 py-4 text-sm">
                  <span className="font-medium">已有一版可用成片</span>
                  {latestFinalVideoAsset !== undefined && (
                    <div className="aspect-video max-w-xl overflow-hidden bg-muted/40">
                      <AssetVideoPlayer
                        url={latestFinalVideoAsset.url}
                        thumbnailUrl={latestFinalVideoAsset.thumbnailUrl}
                        mimeType={latestFinalVideoAsset.mimeType}
                        alt="当前成片预览"
                      />
                    </div>
                  )}
                  <span className="leading-6 text-muted-foreground">资产 ID：{latestFinalVideo.assetId ?? '未知'}。再次合成只会创建新版本，旧资产仍保留。</span>
                </div>
              )}
            </section>

            <aside className="relative flex flex-col gap-4 lg:pl-6">
              <Separator orientation="vertical" className="absolute inset-y-0 left-0 hidden h-auto lg:block" />
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">合成状态</span>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(assemblyState?.status ?? 'not_started')}>{STATUS_LABELS[assemblyState?.status ?? 'not_started']}</Badge>
                  <span className="text-sm text-muted-foreground">视频合成</span>
                </div>
              </div>
              <Separator />
              {assemblyState?.lastError !== null && assemblyState?.lastError !== undefined && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="leading-6">{assemblyState.lastError.message}</span>
                </div>
              )}
              <Button
                onClick={() => void prepareAssemblyRun()}
                disabled={assemblyPreflighting || assemblyConfirmOpen || activeRunId !== undefined || dirty}
              >
                {assemblyPreflighting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Video data-icon="inline-start" />}
                {assemblyPreflighting ? '正在预检' : '预检并合成'}
              </Button>
              {dirty && <p className="text-xs leading-5 text-muted-foreground">请先保存剧本修改，再执行合成。</p>}
              <Separator />
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="leading-6 text-muted-foreground">合成不消耗模型额度，只创建一条媒体处理任务。</span>
                </div>
                <div className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="leading-6 text-muted-foreground">页面关闭后任务仍会由 Worker 继续执行。</span>
                </div>
              </div>
            </aside>
          </div>
        </TabsContent>

        {TAB_ITEMS.filter(tab => tab.value !== 'analyze' && tab.value !== 'characters' && tab.value !== 'locations' && tab.value !== 'references' && tab.value !== 'storyboard' && tab.value !== 'continuity' && tab.value !== 'prompts' && tab.value !== 'dialogue' && tab.value !== 'videos' && tab.value !== 'bgm' && tab.value !== 'assemble').map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="mt-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <section className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-xl bg-muted/30 px-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LockKeyhole className="size-5" />
                </div>
                <div className="flex max-w-lg flex-col gap-2">
                  <h2 className="font-semibold">{tab.label}阶段已纳入项目流程</h2>
                  <p className="text-sm leading-6 text-muted-foreground">阶段执行器正在接入现有任务队列。接入后，你可以在这里生成、编辑、锁定和单项重试结果。</p>
                </div>
              </section>
              <PhaseStatusPanel project={project} phases={tab.phases} />
            </div>
          </TabsContent>
        ))}
      </Tabs>
      </main>
      <AssetPickerDialog
        open={referencePickerOpen}
        onOpenChange={open => {
          setReferencePickerOpen(open)
          if (!open) setReferenceTarget(undefined)
        }}
        mediaKind="image"
        onSelect={assets => void attachReferenceAsset(assets)}
      />
      <Dialog
        open={videoConfirmOpen}
        onOpenChange={open => {
          setVideoConfirmOpen(open)
          if (!open) setVideoRetryShotId(undefined)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认提交视频生成</DialogTitle>
            <DialogDescription>
              {videoRetryShotId === undefined ? '这次将为当前未完成的锁定镜头创建独立视频任务。' : '这次只会重试选中的失败镜头，不会重复提交已经成功的镜头。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 bg-muted/30 px-4 py-4 text-sm">
            <div className="flex items-center justify-between">
              <span>待生成镜头</span>
              <span>{videoEstimate?.shotCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>预估费用</span>
              <span className="font-semibold">{formatCents(videoEstimate?.estimatedCents)}</span>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">这是预估费用，最终扣费以 provider 实际结算为准。确认后会按镜头独立扣费并支持续跑。</p>
          <DialogFooter className="border-t-0 bg-transparent px-0 pb-0">
            <Button variant="outline" onClick={() => setVideoConfirmOpen(false)}>取消</Button>
            <Button onClick={() => void confirmVideoRun()} disabled={videoEstimate === undefined}>{videoRetryShotId === undefined ? '确认提交' : '确认重试'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={musicConfirmOpen} onOpenChange={setMusicConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认生成背景音乐</DialogTitle>
            <DialogDescription>确认后会创建真实音乐生成任务并扣除实际费用，生成结果会回写到导演台音乐资产。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 bg-muted/30 px-4 py-4 text-sm">
            <div className="flex items-center justify-between"><span>费用预估时长</span><span>{musicEstimate?.durationSeconds ?? 0} 秒</span></div>
            <div className="flex items-center justify-between"><span>预估费用</span><span className="font-semibold">{formatCents(musicEstimate?.estimatedCents)}</span></div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">这是预估费用，最终扣费以 provider 实际结算为准。</p>
          <DialogFooter className="border-t-0 bg-transparent px-0 pb-0">
            <Button variant="outline" onClick={() => setMusicConfirmOpen(false)}>取消</Button>
            <Button onClick={() => void confirmMusicRun()} disabled={musicEstimate === undefined}>确认生成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={assemblyConfirmOpen} onOpenChange={setAssemblyConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>确认合成成片</DialogTitle>
            <DialogDescription>这一步只会执行本地媒体合成，不会再次调用视频或音乐生成模型。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 bg-muted/30 px-4 py-4 text-sm">
            <div className="flex items-center justify-between gap-3"><span>镜头数量</span><span>{assemblyPreflight?.plan.shots.length ?? 0}</span></div>
            <div className="flex items-center justify-between gap-3"><span>预计时长</span><span>{assemblyPreflight?.plan.totalDurationSeconds.toFixed(1) ?? '0.0'} 秒</span></div>
            <div className="flex items-center justify-between gap-3"><span>输出尺寸</span><span>{assemblyPreflight?.plan.settings.width} × {assemblyPreflight?.plan.settings.height} / {assemblyPreflight?.plan.settings.fps} fps</span></div>
            <div className="flex items-center justify-between gap-3"><span>背景音乐</span><span>{assemblyPreflight?.plan.music === null ? '不使用' : '使用当前有效音乐'}</span></div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">确认后会创建一个可追踪的媒体任务。合成失败时，已生成的镜头和音乐资产不会被删除。</p>
          <DialogFooter className="border-t-0 bg-transparent px-0 pb-0">
            <Button variant="outline" onClick={() => setAssemblyConfirmOpen(false)}>取消</Button>
            <Button onClick={() => void confirmAssemblyRun()} disabled={assemblyPreflight?.ready !== true || saving}>确认合成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DirectorContinuityReview({ result, rawText, stale = false }: { result?: DirectorContinuityResult; rawText?: string; stale?: boolean }) {
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

function DirectorPromptRebuildReview({
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

function DirectorDialogueReview({
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

function DirectorDialogueSuggestionCard({
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

function DirectorPromptSuggestionCard({
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

function DirectorVideoShotList({ project, assetItems, onRetry, retryingShotId }: { project: DirectorProjectDetail; assetItems: Record<string, AssetItem>; onRetry: (shotId: string) => void; retryingShotId?: string }) {
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
            {shot.status === 'failed' && (
              <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={() => onRetry(shot.id)} disabled={retryingShotId === shot.id}>
                {retryingShotId === shot.id ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
                重试本镜
              </Button>
            )}
          </article>
        )
      })}
    </div>
  )
}

function shotStatusLabel(status: DirectorShot['status']): string {
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

function shotStatusVariant(status: DirectorShot['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'succeeded') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'generating' || status === 'locked') return 'secondary'
  return 'outline'
}

function applyDirectorVideoProgress(project: DirectorProjectDetail, outputSummary: Record<string, unknown> | null): DirectorProjectDetail {
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

function ReferenceEntityGroup({
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

function StoryboardReview({ project, shots, assetItems, saving, onSave }: { project: DirectorProjectDetail; shots: DirectorShot[]; assetItems: Record<string, AssetItem>; saving: boolean; onSave: (shotId: string, input: UpdateDirectorShotInput) => Promise<void> }) {
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

function referenceKeysForShot(shot: DirectorShot): string[] {
  return Array.isArray(shot.continuity?.referenceKeys)
    ? shot.continuity.referenceKeys.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
}

function referenceBindingsForKey(project: DirectorProjectDetail, key: string): DirectorAsset[] {
  const ownerIds = [
    ...project.characters.filter(character => character.staleAt === null && character.name === key).map(character => character.id),
    ...project.locations.filter(location => location.staleAt === null && location.name === key).map(location => location.id),
  ]
  return project.assets.filter(asset => asset.staleAt === null && asset.assetId !== null && asset.ownerId !== null && ownerIds.includes(asset.ownerId))
}

function ShotReferencePicker({
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

function StoryboardShotCard({
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

function dialogueLinesFor(dialogue: DirectorShot['dialogue']): Array<{ speaker: string; text: string }> {
  if (dialogue === null || !Array.isArray(dialogue.lines)) return []
  return dialogue.lines.filter((line): line is { speaker: string; text: string } => {
    if (typeof line !== 'object' || line === null || Array.isArray(line)) return false
    const candidate = line as { speaker?: unknown; text?: unknown }
    return typeof candidate.speaker === 'string' && typeof candidate.text === 'string'
  })
}

function ScreenplayChatWorkspace({
  messages,
  pendingMessage,
  historyError,
  onRetryHistory,
  screenplay,
  scriptVersion,
  scriptVersionId,
  currentScriptVersionId,
  scriptVersions,
  scriptVersionsLoading,
  scriptVersionLoading,
  scriptVersionsError,
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
  historyError?: string
  onRetryHistory: () => void
  screenplay: string
  scriptVersion: number
  scriptVersionId: string
  currentScriptVersionId: string
  scriptVersions: DirectorScriptVersionSummary[]
  scriptVersionsLoading: boolean
  scriptVersionLoading: boolean
  scriptVersionsError?: string
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
                    {scriptVersionsError !== undefined && <DropdownMenuItem disabled>{scriptVersionsError}</DropdownMenuItem>}
                    {!scriptVersionsLoading && scriptVersionsError === undefined && scriptVersions.length === 0 && (
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
            {historyError !== undefined && (
              <div className="flex items-center justify-between gap-3 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>{historyError}</span>
                <Button type="button" variant="ghost" size="sm" onClick={onRetryHistory}>重试</Button>
              </div>
            )}
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

function AnalysisReview({ result, rawText, stale = false }: { result?: DirectorAnalysisResult; rawText?: string; stale?: boolean }) {
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

function LocationsReview({ result, rawText, stale = false }: { result?: DirectorLocationsResult; rawText?: string; stale?: boolean }) {
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

function CharactersReview({ result, rawText, stale = false }: { result?: DirectorCharactersResult; rawText?: string; stale?: boolean }) {
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

function PhaseStatusPanel({
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
