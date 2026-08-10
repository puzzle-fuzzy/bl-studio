import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleDashed, FileText, Loader2, LockKeyhole, Save, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { DirectorAnalysisResult, DirectorCharactersResult, DirectorLocationsResult, DirectorProjectDetail, ModelCatalogItem } from '@bailian-studio/api-client'
import { DIRECTOR_PHASE_LABELS, DIRECTOR_PHASES } from '@bailian-studio/api-client'
import { DirectorAnalysisResultSchema, DirectorCharactersResultSchema, DirectorLocationsResultSchema } from '@bailian-studio/api-client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { apiClient } from '@/lib/api'
import { modelNameZh } from '@/lib/model-modes'
import { useModelCatalogStore } from '@/stores/model-catalog-store'

type DirectorPhase = (typeof DIRECTOR_PHASES)[number]

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
  queued: '绛夊緟鎵ц',
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
  const [activeRunId, setActiveRunId] = useState<string>()
  const [activePhase, setActivePhase] = useState<DirectorPhase>()
  const [analysisText, setAnalysisText] = useState<string>()
  const [analysisResult, setAnalysisResult] = useState<DirectorAnalysisResult>()
  const [analysisStale, setAnalysisStale] = useState(false)
  const [charactersText, setCharactersText] = useState<string>()
  const [charactersResult, setCharactersResult] = useState<DirectorCharactersResult>()
  const [charactersStale, setCharactersStale] = useState(false)
  const [locationsText, setLocationsText] = useState<string>()
  const [locationsResult, setLocationsResult] = useState<DirectorLocationsResult>()
  const [locationsStale, setLocationsStale] = useState(false)
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const textModels = useMemo(() => models.filter(model => model.category === 'text'), [models])

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
    if (id === undefined) return
    let cancelled = false
    setLoading(true)
    void apiClient.getDirectorProject(id)
      .then(next => {
        if (cancelled) return
        setProject(next)
        setTitle(next.title)
        setStoryText(next.storyText)
        setSynopsis(next.synopsis ?? '')
        setActiveRunId(undefined)
        setActivePhase(undefined)
        setAnalysisText(undefined)
        setAnalysisResult(undefined)
        setAnalysisStale(false)
        setCharactersText(undefined)
        setCharactersResult(undefined)
        setCharactersStale(false)
        setLocationsText(undefined)
        setLocationsResult(undefined)
        setLocationsStale(false)
        const analysisState = next.phases.find(state => state.phase === 'analyze')
        const charactersState = next.phases.find(state => state.phase === 'characters')
        const locationsState = next.phases.find(state => state.phase === 'locations')
        if (analysisState?.status === 'queued' || analysisState?.status === 'running') {
          setActiveRunId(analysisState.activeRunId ?? undefined)
          setActivePhase('analyze')
        } else if (charactersState?.status === 'queued' || charactersState?.status === 'running') {
          setActiveRunId(charactersState.activeRunId ?? undefined)
          setActivePhase('characters')
        } else if (locationsState?.status === 'queued' || locationsState?.status === 'running') {
          setActiveRunId(locationsState.activeRunId ?? undefined)
          setActivePhase('locations')
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
      })
      .catch(() => {
        if (!cancelled) setError('项目不存在，或你没有访问权限。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (id === undefined || activeRunId === undefined || activePhase === undefined) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const run = await apiClient.getDirectorPhaseRun(id, activePhase, activeRunId)
        if (cancelled) return
        if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
          const next = await apiClient.getDirectorProject(id)
          if (cancelled) return
          setProject(next)
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
          setActiveRunId(undefined)
          setActivePhase(undefined)
          toast[run.status === 'succeeded' ? 'success' : 'error'](run.status === 'succeeded'
            ? activePhase === 'analyze' ? '剧本分析已完成' : activePhase === 'characters' ? '角色阶段已完成' : '场景阶段已完成'
            : activePhase === 'analyze' ? '剧本分析未完成，请查看阶段状态' : activePhase === 'characters' ? '角色阶段未完成，请查看阶段状态' : '场景阶段未完成，请查看阶段状态')
          return
        }
        timer = setTimeout(() => void poll(), 2_000)
      } catch {
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

  const runAnalysis = async () => {
    if (id === undefined || analysisModelId.length === 0 || dirty || activeRunId !== undefined) return
    setSaving(true)
    try {
      const run = await apiClient.requestDirectorPhaseRun(id, 'analyze', { modelId: analysisModelId })
      setActiveRunId(run.id)
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

  return (
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
            <Button size="sm" onClick={() => void saveProject()} disabled={!dirty || saving}>
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
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

        {TAB_ITEMS.filter(tab => tab.value !== 'analyze' && tab.value !== 'characters' && tab.value !== 'locations').map(tab => (
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
      {phases.includes('analyze') && status === 'failed' && states[0]?.lastError !== null && states[0]?.lastError !== undefined && (
        <p className="text-xs leading-5 text-destructive">{states[0].lastError.message}</p>
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
