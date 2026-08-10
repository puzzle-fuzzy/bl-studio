import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CircleDashed, FileText, Loader2, LockKeyhole, Save, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { DirectorProjectDetail, ModelCatalogItem } from '@bailian-studio/api-client'
import { DIRECTOR_PHASE_LABELS, DIRECTOR_PHASES } from '@bailian-studio/api-client'
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
  const [activeRunId, setActiveRunId] = useState<string>()
  const [analysisText, setAnalysisText] = useState<string>()
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
        const analysisState = next.phases.find(state => state.phase === 'analyze')
        if (analysisState?.status === 'queued' || analysisState?.status === 'running') {
          setActiveRunId(analysisState.activeRunId ?? undefined)
        }
        if (analysisState?.lastRunId !== null && analysisState?.lastRunId !== undefined) {
          void apiClient.getDirectorPhaseRun(id, 'analyze', analysisState.lastRunId)
            .then(run => {
              if (!cancelled && run.status === 'succeeded' && typeof run.outputSummary?.analysisText === 'string') {
                setAnalysisText(run.outputSummary.analysisText)
              }
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
    if (id === undefined || activeRunId === undefined) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const run = await apiClient.getDirectorPhaseRun(id, 'analyze', activeRunId)
        if (cancelled) return
        if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
          const next = await apiClient.getDirectorProject(id)
          if (cancelled) return
          setProject(next)
          if (run.status === 'succeeded' && typeof run.outputSummary?.analysisText === 'string') {
            setAnalysisText(run.outputSummary.analysisText)
          }
          setActiveRunId(undefined)
          toast[run.status === 'succeeded' ? 'success' : 'error'](run.status === 'succeeded' ? '剧本分析已完成' : '剧本分析未完成，请查看阶段状态')
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
  }, [activeRunId, id])

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
                <section className="flex flex-col gap-3 bg-muted/30 px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">分析结果</h2>
                    <span className="text-xs text-muted-foreground">可作为下一阶段输入参考</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{analysisText}</p>
                </section>
              )}
            </section>
            <PhaseStatusPanel
              project={project}
              phases={['analyze']}
              analysisModelId={analysisModelId}
              textModels={textModels}
              running={activeRunId !== undefined}
              onAnalysisModelChange={setAnalysisModelId}
              onRunAnalysis={() => void runAnalysis()}
              blockedByUnsavedChanges={dirty}
            />
          </div>
        </TabsContent>

        {TAB_ITEMS.filter(tab => tab.value !== 'analyze').map(tab => (
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

function PhaseStatusPanel({
  project,
  phases,
  analysisModelId,
  textModels,
  running,
  onAnalysisModelChange,
  onRunAnalysis,
  blockedByUnsavedChanges,
}: {
  project: DirectorProjectDetail
  phases: DirectorPhase[]
  analysisModelId?: string
  textModels?: ModelCatalogItem[]
  running?: boolean
  onAnalysisModelChange?: (value: string) => void
  onRunAnalysis?: () => void
  blockedByUnsavedChanges?: boolean
}) {
  const states = project.phases.filter(state => phases.includes(state.phase))
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
      {phases.includes('analyze') && analysisModelId !== undefined && textModels !== undefined && onAnalysisModelChange !== undefined && onRunAnalysis !== undefined && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="director-analysis-model">
            分析模型
            <Select value={analysisModelId} onValueChange={onAnalysisModelChange} disabled={running || textModels.length === 0}>
              <SelectTrigger id="director-analysis-model" className="w-full">
                <SelectValue placeholder="选择文本模型" />
              </SelectTrigger>
              <SelectContent>
                {textModels.map(model => <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button
            onClick={onRunAnalysis}
            disabled={running || blockedByUnsavedChanges || (status !== 'ready' && status !== 'failed' && status !== 'needs_review') || textModels.length === 0}
          >
            {running ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
            {running ? '分析执行中' : '开始剧本分析'}
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
