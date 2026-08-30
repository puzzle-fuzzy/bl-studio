import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CircleDashed, FileText, Image as ImageIcon, Loader2, LockKeyhole, Save, Sparkles, Video } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { AssetItem, DirectorAnalysisResult, DirectorAsset, DirectorAssemblyPreflight, DirectorCharactersResult, DirectorContinuityResult, DirectorDialogueResult, DirectorLocationsResult, DirectorMusicEstimate, DirectorProjectDetail, DirectorPromptRebuildResult, DirectorScriptMessage, DirectorScriptVersion, DirectorScriptVersionSummary, DirectorVideoEstimate, UpdateDirectorShotInput } from '@bailian-studio/api-client'
import { ApiClientError, DIRECTOR_PHASE_LABELS, DIRECTOR_PHASES } from '@bailian-studio/api-client'
import { DirectorAnalysisResultSchema, DirectorCharactersResultSchema, DirectorContinuityResultSchema, DirectorDialogueResultSchema, DirectorLocationsResultSchema, DirectorPromptRebuildResultSchema } from '@bailian-studio/api-client'
import { toast } from 'sonner'
import { Badge } from '@bailian-studio/ui'
import { Button } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { AssetPickerDialog } from '@/components/assets/AssetPickerDialog'
import { AssetVideoPlayer } from '@/components/assets/AssetVideoPlayer'
import { Input } from '@bailian-studio/ui'
import { Separator } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@bailian-studio/ui'
import { Textarea } from '@bailian-studio/ui'
import { VirtualScrollArea } from '@/components/ui/virtual-scroll-area'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'
import { formatCents } from '@/lib/money'
import { parseDirectorPhaseResult, type DirectorPhaseResultSpec } from '@/lib/director-phase-result'
import { markDirectorPhaseQueued } from '@/lib/director-phase-state'
import { useReferenceAssetsStore } from '@/stores/reference-assets-store'
import { useModelCatalog } from '@/hooks/use-model-catalog'
import { usePhaseReview } from '@/hooks/use-phase-review'
import { usePreferredModel } from '@/hooks/use-preferred-model'
import { resolveActiveDirectorPhase } from '@/lib/director-phase'
import { AnalysisReview, applyDirectorVideoProgress, CharactersReview, DirectorContinuityReview, DirectorDialogueReview, DirectorPromptRebuildReview, DirectorVideoShotList, LocationsReview, PhaseStatusPanel, ReferenceEntityGroup, ScreenplayChatWorkspace, StoryboardReview } from '@/components/director/review-components'

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

function _formatScriptVersionDate(value: string): string {
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
  const [title, setTitle] = useState('')
  const [storyText, setStoryText] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [saving, setSaving] = useState(false)
  const { modelId: analysisModelId, setModelId: setAnalysisModelId, text: analysisText, setText: setAnalysisText, result: analysisResult, setResult: setAnalysisResult, stale: analysisStale, setStale: setAnalysisStale } = usePhaseReview<DirectorAnalysisResult>()
  const { modelId: charactersModelId, setModelId: setCharactersModelId, text: charactersText, setText: setCharactersText, result: charactersResult, setResult: setCharactersResult, stale: charactersStale, setStale: setCharactersStale } = usePhaseReview<DirectorCharactersResult>()
  const { modelId: locationsModelId, setModelId: setLocationsModelId, text: locationsText, setText: setLocationsText, result: locationsResult, setResult: setLocationsResult, stale: locationsStale, setStale: setLocationsStale } = usePhaseReview<DirectorLocationsResult>()
  const [storyboardModelId, setStoryboardModelId] = useState('')
  const { modelId: continuityModelId, setModelId: setContinuityModelId, text: continuityText, setText: setContinuityText, result: continuityResult, setResult: setContinuityResult, stale: continuityStale, setStale: setContinuityStale } = usePhaseReview<DirectorContinuityResult>()
  const [videoModelId, setVideoModelId] = useState('')
  const [activeRunId, setActiveRunId] = useState<string>()
  const [activePhase, setActivePhase] = useState<DirectorPhase>()
  const [videoEstimate, setVideoEstimate] = useState<DirectorVideoEstimate>()
  const [videoConfirmOpen, setVideoConfirmOpen] = useState(false)
  const [videoEstimating, setVideoEstimating] = useState(false)
  const [videoRetryShotId, setVideoRetryShotId] = useState<string>()
  const [videoRetryingShotId, setVideoRetryingShotId] = useState<string>()
  const [scriptMessages, setScriptMessages] = useState<DirectorScriptMessage[]>([])
  const [pendingScriptMessage, setPendingScriptMessage] = useState<ScriptMessageView>()
  const [scriptMessage, setScriptMessage] = useState('')
  const [scriptVersions, setScriptVersions] = useState<DirectorScriptVersionSummary[]>([])
  const [selectedScriptVersion, setSelectedScriptVersion] = useState<DirectorScriptVersion>()
  const [scriptVersionsLoading, setScriptVersionsLoading] = useState(false)
  const [scriptVersionLoading, setScriptVersionLoading] = useState(false)
  const scriptMessagesRequestRef = useRef(0)
  const scriptVersionsRequestRef = useRef(0)
  const scriptVersionRequestRef = useRef(0)
  const videoEstimateRequestRef = useRef(0)
  const musicEstimateRequestRef = useRef(0)
  const assemblyPreflightRequestRef = useRef(0)
  const projectSessionRef = useRef(0)
  const scriptVersionCacheRef = useRef(new Map<string, DirectorScriptVersion>())
  const { modelId: promptRebuildModelId, setModelId: setPromptRebuildModelId, text: promptRebuildText, setText: setPromptRebuildText, result: promptRebuildResult, setResult: setPromptRebuildResult, stale: promptRebuildStale, setStale: setPromptRebuildStale } = usePhaseReview<DirectorPromptRebuildResult>()
  const [applyingPromptShotId, setApplyingPromptShotId] = useState<string>()
  const [appliedPromptShotIds, setAppliedPromptShotIds] = useState<Set<string>>(new Set())
  const { modelId: dialogueModelId, setModelId: setDialogueModelId, text: dialogueText, setText: setDialogueText, result: dialogueResult, setResult: setDialogueResult, stale: dialogueStale, setStale: setDialogueStale } = usePhaseReview<DirectorDialogueResult>()
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
  const { models } = useModelCatalog()
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
        setPendingScriptMessage(current => {
          if (current === undefined || current.runId === null) return current
          return messages.some(message => message.runId === current.runId && message.role === 'user') ? undefined : current
        })
        logDirectorClientEvent('script_messages.load.succeeded', { projectId, reason, requestSequence, messageCount: messages.length })
      })
      .catch(error => {
        if (requestSequence !== scriptMessagesRequestRef.current) return
        notifyError(error)
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
        logDirectorClientEvent('script_versions.load.succeeded', { projectId, reason, requestSequence, versionCount: versions.length })
      })
      .catch(error => {
        if (requestSequence !== scriptVersionsRequestRef.current) return
        notifyError(error)
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
      logDirectorClientEvent('script_version.load.succeeded', { projectId, versionId, requestSequence, version: version.version })
    } catch (error) {
      if (requestSequence !== scriptVersionRequestRef.current) return
      notifyError(error)
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

  usePreferredModel(analysisModelId, textModels, setAnalysisModelId, 'qwen-plus')
  usePreferredModel(charactersModelId, textModels, setCharactersModelId, 'qwen-plus')
  usePreferredModel(locationsModelId, textModels, setLocationsModelId, 'qwen-plus')
  usePreferredModel(storyboardModelId, textModels, setStoryboardModelId, 'qwen-plus')
  usePreferredModel(continuityModelId, textModels, setContinuityModelId, 'qwen-plus')
  usePreferredModel(promptRebuildModelId, textModels, setPromptRebuildModelId, 'qwen-plus')
  usePreferredModel(dialogueModelId, textModels, setDialogueModelId, 'qwen-plus')
  usePreferredModel(videoModelId, videoModels, setVideoModelId, 'wanx-2.7-reference-video')
  usePreferredModel(musicModelId, musicModels, setMusicModelId)

  useEffect(() => {
    projectSessionRef.current += 1
    videoEstimateRequestRef.current += 1
    musicEstimateRequestRef.current += 1
    assemblyPreflightRequestRef.current += 1
    setVideoEstimate(undefined)
    setVideoConfirmOpen(false)
    setVideoRetryShotId(undefined)
    setVideoRetryingShotId(undefined)
    setVideoEstimating(false)
    setMusicEstimate(undefined)
    setMusicConfirmOpen(false)
    setMusicEstimating(false)
    setMusicPrompt('')
    setMusicDuration('60')
    setAssemblyPreflight(undefined)
    setAssemblyConfirmOpen(false)
    setAssemblyPreflighting(false)
    setAssemblyWidth('1080')
    setAssemblyHeight('1920')
    setAssemblyFps('30')
    setAssemblyAudioVolume('1')
    setReferencePickerOpen(false)
    setReferenceTarget(undefined)
    setApplyingPromptShotId(undefined)
    setApplyingDialogueShotId(undefined)
    setSaving(false)
    if (id === undefined) return
    const projectId = id
    let cancelled = false
    setLoading(true)
    void apiClient.getDirectorProject(projectId)
      .then(next => {
        if (cancelled) return
        setProject(next)
        scriptVersionCacheRef.current = new Map([[next.scriptVersion.id, next.scriptVersion]])
        setSelectedScriptVersion(next.scriptVersion)
        setScriptVersions([])
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
        void reloadScriptMessages(projectId, 'project-load')
        void reloadScriptVersions(projectId, 'project-load')
        const analysisState = next.phases.find(state => state.phase === 'analyze')
        const charactersState = next.phases.find(state => state.phase === 'characters')
        const locationsState = next.phases.find(state => state.phase === 'locations')
        const continuityState = next.phases.find(state => state.phase === 'continuity')
        const promptRebuildState = next.phases.find(state => state.phase === 'rebuild')
        const dialogueState = next.phases.find(state => state.phase === 'dialogue')
        const activePhaseState = resolveActiveDirectorPhase(next.phases)
        if (activePhaseState !== undefined) {
          setActiveRunId(activePhaseState.runId)
          setActivePhase(activePhaseState.phase)
        }
        function loadPhaseResult<Result>(
          phase: DirectorPhase,
          phaseState: DirectorProjectDetail['phases'][number] | undefined,
          spec: DirectorPhaseResultSpec<Result>,
          setText: (value: string) => void,
          setResult: (value: Result) => void,
          setStale: (value: boolean) => void,
        ) {
          if (phaseState?.lastRunId === null || phaseState?.lastRunId === undefined) return
          void apiClient.getDirectorPhaseRun(projectId, phase, phaseState.lastRunId)
            .then(run => {
              if (cancelled || run.status !== 'succeeded') return
              const parsed = parseDirectorPhaseResult(run.outputSummary, run.staleAt, spec)
              if (parsed.text !== undefined) setText(parsed.text)
              setStale(parsed.stale)
              if (parsed.result !== undefined) setResult(parsed.result)
            })
            .catch(() => {})
        }
        loadPhaseResult('analyze', analysisState, { textKey: 'analysisText', resultKey: 'analysis', schema: DirectorAnalysisResultSchema }, setAnalysisText, setAnalysisResult, setAnalysisStale)
        loadPhaseResult('characters', charactersState, { textKey: 'charactersText', resultKey: 'characters', schema: DirectorCharactersResultSchema }, setCharactersText, setCharactersResult, setCharactersStale)
        loadPhaseResult('locations', locationsState, { textKey: 'locationsText', resultKey: 'locations', schema: DirectorLocationsResultSchema }, setLocationsText, setLocationsResult, setLocationsStale)
        loadPhaseResult('continuity', continuityState, { textKey: 'continuityText', resultKey: 'continuity', schema: DirectorContinuityResultSchema }, setContinuityText, setContinuityResult, setContinuityStale)
        loadPhaseResult('rebuild', promptRebuildState, { textKey: 'promptRebuildText', resultKey: 'promptRebuild', schema: DirectorPromptRebuildResultSchema }, setPromptRebuildText, setPromptRebuildResult, setPromptRebuildStale)
        loadPhaseResult('dialogue', dialogueState, { textKey: 'dialogueText', resultKey: 'dialogue', schema: DirectorDialogueResultSchema }, setDialogueText, setDialogueResult, setDialogueStale)
      })
      .catch(() => {
        if (!cancelled) {
          notifyError(new Error('项目不存在，或你没有访问权限。'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      projectSessionRef.current += 1
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
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'analyze', { modelId: analysisModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('analyze')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'analyze', run),
      })
      toast.success('剧本分析已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动剧本分析，请确认阶段已准备好')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const sendScriptMessage = async () => {
    const message = scriptMessage.trim()
    if (id === undefined || analysisModelId.length === 0 || message.length === 0 || activeRunId !== undefined || isHistoricalScriptVersion) return
    const projectSession = projectSessionRef.current
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
      if (projectSession !== projectSessionRef.current) return
      setPendingScriptMessage(current => current?.id === clientMessageId ? { ...current, runId: run.id } : current)
      void reloadScriptMessages(id, 'chat-queued')
      setActiveRunId(run.id)
      setActivePhase('analyze')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'analyze', run),
      })
      logDirectorClientEvent('script_chat.send.queued', {
        projectId: id,
        phaseRunId: run.id,
        taskId: run.taskId,
        clientMessageId,
      })
    } catch (error) {
      if (projectSession !== projectSessionRef.current) return
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
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'characters', { modelId: charactersModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('characters')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'characters', run),
      })
      toast.success('角色阶段已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动角色阶段，请确认剧本分析已完成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const runLocations = async () => {
    if (id === undefined || locationsModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'locations', { modelId: locationsModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('locations')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'locations', run),
      })
      toast.success('场景阶段已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动场景阶段，请确认角色阶段已完成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const runStoryboard = async () => {
    if (id === undefined || storyboardModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'storyboard', { modelId: storyboardModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('storyboard')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'storyboard', run),
      })
      toast.success('分镜阶段已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动分镜阶段，请确认分析、角色和场景都已完成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const runContinuity = async () => {
    if (id === undefined || continuityModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'continuity', { modelId: continuityModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('continuity')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'continuity', run),
      })
      toast.success('连续性检查已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动连续性检查，请确认分镜已经生成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const runPromptRebuild = async () => {
    if (id === undefined || promptRebuildModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'rebuild', { modelId: promptRebuildModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('rebuild')
      setPromptRebuildText(undefined)
      setPromptRebuildResult(undefined)
      setPromptRebuildStale(false)
      setAppliedPromptShotIds(new Set())
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'rebuild', run),
      })
      toast.success('视频提示词重建已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动视频提示词重建，请确认当前分镜已经生成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const applyPromptSuggestion = async (shotId: string, patch: UpdateDirectorShotInput) => {
    if (id === undefined) return
    const projectSession = projectSessionRef.current
    setApplyingPromptShotId(shotId)
    try {
      const shot = await apiClient.updateDirectorShot(id, shotId, patch)
      if (projectSession !== projectSessionRef.current) return
      setProject(current => current === undefined
        ? current
        : { ...current, shots: current.shots.map(candidate => candidate.id === shot.id ? shot : candidate) })
      setAppliedPromptShotIds(current => new Set(current).add(shotId))
      toast.success(`镜头 ${String(shot.sequence).padStart(2, '0')} 的提示词已应用，请重新审核并锁定`)
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('提示词应用失败，请确认镜头未锁定且仍属于当前分镜')
    } finally {
      if (projectSession === projectSessionRef.current) setApplyingPromptShotId(undefined)
    }
  }

  const runDialogue = async () => {
    if (id === undefined || dialogueModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'dialogue', { modelId: dialogueModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('dialogue')
      setDialogueText(undefined)
      setDialogueResult(undefined)
      setDialogueStale(false)
      setAppliedDialogueShotIds(new Set())
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'dialogue', run),
      })
      toast.success('对白整理已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动对白整理，请确认当前分镜已经生成')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const applyDialogueSuggestion = async (shotId: string, lines: Array<{ speaker: string; text: string; delivery: string }>) => {
    if (id === undefined) return
    const shot = project?.shots.find(candidate => candidate.id === shotId)
    if (shot === undefined) return
    const projectSession = projectSessionRef.current
    setApplyingDialogueShotId(shotId)
    try {
      const updated = await apiClient.updateDirectorShot(id, shotId, { expectedVersion: shot.version, dialogue: { lines } })
      if (projectSession !== projectSessionRef.current) return
      setProject(current => current === undefined
        ? current
        : { ...current, shots: current.shots.map(candidate => candidate.id === updated.id ? updated : candidate) })
      setAppliedDialogueShotIds(current => new Set(current).add(shotId))
      toast.success(`镜头 ${String(updated.sequence).padStart(2, '0')} 的对白已应用，请重新审核并锁定`)
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('对白应用失败，请确认镜头未锁定且仍属于当前分镜')
    } finally {
      if (projectSession === projectSessionRef.current) setApplyingDialogueShotId(undefined)
    }
  }

  const prepareMusicRun = async () => {
    const duration = Number.parseInt(musicDuration, 10)
    if (id === undefined || musicModelId.length === 0 || musicPrompt.trim().length === 0 || !Number.isInteger(duration) || duration < 1 || dirty || activeRunId !== undefined || musicEstimating || musicConfirmOpen) return
    const requestSequence = musicEstimateRequestRef.current + 1
    musicEstimateRequestRef.current = requestSequence
    setMusicEstimating(true)
    try {
      const estimate = await apiClient.estimateDirectorMusic(id, {
        modelId: musicModelId,
        prompt: musicPrompt.trim(),
        isInstrumental: true,
        duration,
      })
      if (requestSequence !== musicEstimateRequestRef.current) return
      setMusicEstimate(estimate)
      setMusicConfirmOpen(true)
    } catch {
      if (requestSequence === musicEstimateRequestRef.current) toast.error('无法估算音乐费用，请确认音乐描述和模型配置')
    } finally {
      if (requestSequence === musicEstimateRequestRef.current) setMusicEstimating(false)
    }
  }

  const confirmMusicRun = async () => {
    const duration = Number.parseInt(musicDuration, 10)
    if (id === undefined || musicModelId.length === 0 || musicPrompt.trim().length === 0 || !Number.isInteger(duration)) return
    const projectSession = projectSessionRef.current
    setMusicConfirmOpen(false)
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'bgm', {
        modelId: musicModelId,
        prompt: musicPrompt.trim(),
        isInstrumental: true,
        duration,
      })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('bgm')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'bgm', run),
      })
      toast.success('音乐生成已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动音乐生成，请确认当前阶段已准备好')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
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
    const requestSequence = assemblyPreflightRequestRef.current + 1
    assemblyPreflightRequestRef.current = requestSequence
    setAssemblyPreflighting(true)
    try {
      const preflight = await apiClient.getDirectorAssemblyPreflight(id, { assembly: settings })
      if (requestSequence !== assemblyPreflightRequestRef.current) return
      setAssemblyPreflight(preflight)
      if (!preflight.ready) {
        toast.error(preflight.issues[0]?.message ?? '当前镜头还不能合成')
        return
      }
      setAssemblyConfirmOpen(true)
    } catch {
      if (requestSequence === assemblyPreflightRequestRef.current) toast.error('合成预检失败，请确认视频镜头已经完成并重试')
    } finally {
      if (requestSequence === assemblyPreflightRequestRef.current) setAssemblyPreflighting(false)
    }
  }

  const confirmAssemblyRun = async () => {
    const settings = readAssemblySettings()
    if (id === undefined || settings === undefined || assemblyPreflight?.ready !== true || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    setAssemblyConfirmOpen(false)
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'assemble', { assembly: settings })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('assemble')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'assemble', run),
      })
      toast.success('合成任务已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('合成任务启动失败，请重新执行预检')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const confirmVideoRun = async () => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined) return
    const projectSession = projectSessionRef.current
    const retryShotId = videoRetryShotId
    setVideoConfirmOpen(false)
    if (retryShotId !== undefined) setVideoRetryingShotId(retryShotId)
    setSaving(true)
    try {
      const run = retryShotId === undefined
        ? await apiClient.requestDirectorPhaseRun(id, 'videos', { modelId: videoModelId })
        : await apiClient.requestDirectorShotVideoRun(id, retryShotId, { modelId: videoModelId })
      if (projectSession !== projectSessionRef.current) return
      setActiveRunId(run.id)
      setActivePhase('videos')
      setProject(current => current === undefined ? current : {
        ...current,
        phases: markDirectorPhaseQueued(current.phases, 'videos', run),
      })
      toast.success('视频生成已加入执行队列')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('无法启动视频生成，请确认所有分镜已锁定')
    } finally {
      if (projectSession === projectSessionRef.current) {
        setSaving(false)
        setVideoRetryingShotId(undefined)
        setVideoRetryShotId(undefined)
      }
    }
  }

  const prepareVideoRun = async () => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined) return
    const requestSequence = videoEstimateRequestRef.current + 1
    videoEstimateRequestRef.current = requestSequence
    setVideoRetryShotId(undefined)
    setVideoEstimating(true)
    try {
      const estimate = await apiClient.estimateDirectorVideoPhase(id, { modelId: videoModelId })
      if (requestSequence !== videoEstimateRequestRef.current) return
      setVideoEstimate(estimate)
      if (estimate.shotCount === 0) {
        toast.success('当前没有需要新生成的视频镜头')
      } else {
        setVideoConfirmOpen(true)
      }
    } catch {
      if (requestSequence === videoEstimateRequestRef.current) toast.error('暂时无法估算视频成本，请确认所有分镜已锁定')
    } finally {
      if (requestSequence === videoEstimateRequestRef.current) setVideoEstimating(false)
    }
  }

  const prepareShotRetry = async (shotId: string) => {
    if (id === undefined || videoModelId.length === 0 || dirty || activeRunId !== undefined || videoConfirmOpen || videoEstimating || videoRetryingShotId !== undefined) return
    const requestSequence = videoEstimateRequestRef.current + 1
    videoEstimateRequestRef.current = requestSequence
    setVideoRetryingShotId(shotId)
    try {
      const estimate = await apiClient.estimateDirectorShotVideo(id, shotId, { modelId: videoModelId })
      if (requestSequence !== videoEstimateRequestRef.current) return
      setVideoRetryShotId(shotId)
      setVideoEstimate(estimate)
      setVideoConfirmOpen(true)
    } catch {
      if (requestSequence === videoEstimateRequestRef.current) {
        setVideoRetryShotId(undefined)
        toast.error('暂时无法估算单镜重试成本，请确认镜头仍处于失败状态')
      }
    } finally {
      if (requestSequence === videoEstimateRequestRef.current) setVideoRetryingShotId(undefined)
    }
  }

  const saveProject = async () => {
    if (id === undefined || !dirty || title.trim().length === 0 || storyText.trim().length === 0) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const next = await apiClient.updateDirectorProject(id, {
        title: title.trim(),
        storyText: storyText.trim(),
        synopsis: synopsis.trim().length > 0 ? synopsis.trim() : null,
      })
      if (projectSession !== projectSessionRef.current) return
      setProject(next)
      setTitle(next.title)
      setStoryText(next.storyText)
      setSynopsis(next.synopsis ?? '')
      if (analysisText !== undefined || analysisResult !== undefined) setAnalysisStale(true)
      if (charactersText !== undefined || charactersResult !== undefined) setCharactersStale(true)
      if (locationsText !== undefined || locationsResult !== undefined) setLocationsStale(true)
      toast.success('项目基础信息已保存')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('保存失败，请稍后重试')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const openReferencePicker = (target: ReferenceTarget) => {
    setReferenceTarget(target)
    setReferencePickerOpen(true)
  }

  const attachReferenceAsset = async (assets: AssetItem[]) => {
    const asset = assets[0]
    if (id === undefined || referenceTarget === undefined || asset === undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      await apiClient.attachDirectorAsset(id, {
        assetId: asset.id,
        kind: referenceTarget.ownerType === 'character' ? 'character_reference' : 'location_reference',
        ownerType: referenceTarget.ownerType,
        ownerId: referenceTarget.ownerId,
      })
      const next = await apiClient.getDirectorProject(id)
      if (projectSession !== projectSessionRef.current) return
      setProject(next)
      void loadReferenceAssets([asset.id])
      toast.success('参考资产已绑定到当前项目')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('参考资产绑定失败，请稍后重试')
    } finally {
      if (projectSession === projectSessionRef.current) {
        setSaving(false)
        setReferencePickerOpen(false)
        setReferenceTarget(undefined)
      }
    }
  }

  const detachReferenceAsset = async (asset: DirectorAsset) => {
    if (id === undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const next = await apiClient.detachDirectorAsset(id, asset.id)
      if (projectSession !== projectSessionRef.current) return
      setProject(next)
      toast.success('已移除导演台引用，原始资产仍保留在资产库')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('移除引用失败，请稍后重试')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
    }
  }

  const updateStoryboardShot = async (shotId: string, input: UpdateDirectorShotInput) => {
    if (id === undefined) return
    const projectSession = projectSessionRef.current
    setSaving(true)
    try {
      const nextShot = await apiClient.updateDirectorShot(id, shotId, input)
      if (projectSession !== projectSessionRef.current) return
      setProject(current => current === undefined ? current : {
        ...current,
        shots: current.shots.map(shot => shot.id === nextShot.id ? nextShot : shot),
      })
      toast.success(input.status === 'locked' ? '镜头已锁定' : input.status === 'needs_review' ? '镜头已解锁' : '镜头修改已保存')
    } catch {
      if (projectSession === projectSessionRef.current) toast.error('镜头保存失败，请稍后重试')
    } finally {
      if (projectSession === projectSessionRef.current) setSaving(false)
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
          <h1 className="text-2xl font-semibold">暂时无法读取导演台项目</h1>
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
            screenplay={displayedScriptVersion.storyText}
            scriptVersion={displayedScriptVersion.version}
            scriptVersionId={displayedScriptVersion.id}
            currentScriptVersionId={project.scriptVersion.id}
            scriptVersions={scriptVersions}
            scriptVersionsLoading={scriptVersionsLoading}
            scriptVersionLoading={scriptVersionLoading}
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
