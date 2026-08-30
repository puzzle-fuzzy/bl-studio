import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DirectorEntityCandidate,
  DirectorEntityCandidateKind,
  DirectorEntityCandidateStatus,
} from '@bailian-studio/api-client'
import { DIRECTOR_PHASE_LABELS } from '@bailian-studio/api-client'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator } from '@bailian-studio/ui'
import { apiClient } from '@/lib/api'
import { notifyError } from '@bailian-studio/lib-client'
import { toast } from 'sonner'
import { useDirectorEvents } from '@/hooks/use-director-events'

const ENTITY_KINDS: Array<{ value: DirectorEntityCandidateKind; label: string }> = [
  { value: 'character', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
]

const ENTITY_STATUSES: Array<{ value: DirectorEntityCandidateStatus; label: string }> = [
  { value: 'provisional', label: '待审核' },
  { value: 'accepted', label: '已采纳' },
  { value: 'rejected', label: '已忽略' },
]

const STATUS_LABELS: Record<DirectorEntityCandidateStatus, string> = {
  provisional: '待审核',
  accepted: '已采纳',
  rejected: '已忽略',
}

const KIND_LABELS: Record<DirectorEntityCandidateKind, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
}

function statusVariant(status: DirectorEntityCandidateStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'accepted') return 'default'
  if (status === 'rejected') return 'outline'
  return 'secondary'
}

function phaseStatusLabel(status: string | undefined): string {
  if (status === undefined) return '尚未执行'
  if (status === 'queued' || status === 'running') return '提取中'
  if (status === 'completed' || status === 'needs_review') return '等待审核'
  if (status === 'failed') return '执行失败'
  if (status === 'cancelled') return '已取消'
  return '尚未执行'
}

export function DirectorProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id ?? ''
  useDirectorEvents(projectId)
  const [selectedKind, setSelectedKind] = useState<DirectorEntityCandidateKind | 'all'>('all')
  const [selectedStatus, setSelectedStatus] = useState<DirectorEntityCandidateStatus | 'all'>('all')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [startedRunId, setStartedRunId] = useState<string>()

  const projectQuery = useQuery({
    queryKey: ['director', 'project', projectId],
    queryFn: () => apiClient.getDirectorProject(projectId),
    enabled: projectId.length > 0,
  })
  const candidatesQuery = useQuery({
    queryKey: ['director', 'entity-candidates', projectId],
    queryFn: () => apiClient.listDirectorEntityCandidates(projectId),
    enabled: projectId.length > 0,
  })
  const modelsQuery = useQuery({
    queryKey: ['models', 'catalog'],
    queryFn: () => apiClient.getModels(),
    staleTime: 5 * 60_000,
  })

  const textModels = useMemo(
    () => (modelsQuery.data ?? []).filter(model => model.category === 'text' && model.availability?.enabled !== false),
    [modelsQuery.data],
  )
  const project = projectQuery.data
  const promotedCandidateIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entity of [...(project?.characters ?? []), ...(project?.locations ?? [])]) {
      const candidateId = entity.metadata.entityCandidateId
      if (typeof candidateId === 'string') ids.add(candidateId)
    }
    return ids
  }, [project?.characters, project?.locations])
  const entityPhase = project?.phases.find(phase => phase.phase === 'entities')
  const activeRunId = startedRunId ?? entityPhase?.activeRunId ?? undefined
  const phaseRunQuery = useQuery({
    queryKey: ['director', 'phase-run', projectId, 'entities', activeRunId],
    queryFn: () => apiClient.getDirectorPhaseRun(projectId, 'entities', activeRunId ?? ''),
    enabled: projectId.length > 0 && activeRunId !== undefined,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === undefined || status === 'pending' || status === 'running' ? 3_000 : false
    },
  })

  useEffect(() => {
    if (selectedModelId.length === 0 && textModels[0] !== undefined) {
      setSelectedModelId(textModels[0].id)
    }
  }, [selectedModelId, textModels])

  useEffect(() => {
    const status = phaseRunQuery.data?.status
    if (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled') return
    void queryClient.invalidateQueries({ queryKey: ['director', 'project', projectId] })
    void queryClient.invalidateQueries({ queryKey: ['director', 'entity-candidates', projectId] })
    if (status === 'succeeded') toast.success('实体提取完成，请审核候选项')
    if (status === 'failed') toast.error('实体提取失败，请查看阶段状态后重试')
  }, [phaseRunQuery.data?.status, projectId, queryClient])

  const runEntitiesMutation = useMutation({
    mutationFn: () => apiClient.requestDirectorPhaseRun(projectId, 'entities', { modelId: selectedModelId }),
    onSuccess: run => {
      setStartedRunId(run.id)
      void queryClient.invalidateQueries({ queryKey: ['director', 'project', projectId] })
      toast.success('实体提取已排队')
    },
    onError: notifyError,
  })

  const reviewMutation = useMutation({
    mutationFn: (input: { candidateId: string; status: 'accepted' | 'rejected' }) => apiClient.reviewDirectorEntityCandidate(input.candidateId, { status: input.status }),
    onSuccess: candidate => {
      queryClient.setQueryData<DirectorEntityCandidate[]>(['director', 'entity-candidates', projectId], current => current?.map(item => item.id === candidate.id ? candidate : item))
      void queryClient.invalidateQueries({ queryKey: ['director', 'project', projectId] })
      toast.success(candidate.status === 'accepted' ? '实体已采纳' : '实体已忽略')
    },
    onError: notifyError,
  })

  const deleteMutation = useMutation({
    mutationFn: (candidateId: string) => apiClient.deleteDirectorEntityCandidate(candidateId),
    onSuccess: (_, candidateId) => {
      queryClient.setQueryData<DirectorEntityCandidate[]>(['director', 'entity-candidates', projectId], current => current?.filter(item => item.id !== candidateId))
      toast.success('候选实体已移除')
    },
    onError: notifyError,
  })

  const filteredCandidates = useMemo(() => {
    return (candidatesQuery.data ?? []).filter(candidate => (
      (selectedKind === 'all' || candidate.kind === selectedKind)
      && (selectedStatus === 'all' || candidate.status === selectedStatus)
    ))
  }, [candidatesQuery.data, selectedKind, selectedStatus])

  if (projectQuery.isPending) {
    return <LoadingState />
  }

  if (projectQuery.error !== null || project === undefined) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">暂时无法读取这个导演台项目。</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void projectQuery.refetch()}>重新加载</Button>
          <Button variant="ghost" onClick={() => navigate('/director')}>返回项目列表</Button>
        </div>
      </main>
    )
  }

  const phaseRunStatus = phaseRunQuery.data?.status
  const isExtracting = runEntitiesMutation.isPending || phaseRunStatus === 'pending' || phaseRunStatus === 'running' || entityPhase?.status === 'queued' || entityPhase?.status === 'running'

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <Link to="/director" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回导演台
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>导演项目</span>
            <span>/</span>
            <span>实体审核</span>
            {entityPhase !== undefined && <Badge variant={entityPhase.status === 'failed' ? 'destructive' : 'outline'}>{phaseStatusLabel(entityPhase.status)}</Badge>}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            先从剧本中提取角色、场景和道具候选。确认后的实体会作为后续参考资产和分镜挂接的稳定语义入口。
          </p>
        </div>
      </header>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>剧本输入</CardTitle>
          <CardDescription>{project.storyText.length} 字 · 当前版本 v{project.scriptVersion.version}</CardDescription>
        </CardHeader>
        <CardContent>
          {project.storyText.length > 0 ? (
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{project.storyText}</p>
          ) : (
            <div className="flex flex-col gap-3 bg-muted/40 px-4 py-5 text-sm">
              <p className="font-medium text-foreground">还没有剧本内容</p>
              <p className="leading-6 text-muted-foreground">先回到写作页输入一段故事，实体提取才有可审核的上下文。</p>
              <Link to="/writing" className="text-primary underline-offset-4 hover:underline">去写作页补充剧本</Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />实体提取</CardTitle>
              <CardDescription>模型只负责提出候选，是否进入制作流程由你确认。</CardDescription>
            </div>
            <Badge variant="secondary">{DIRECTOR_PHASE_LABELS.entities}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label htmlFor="director-entity-model" className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
              文本模型
              <Select value={selectedModelId} onValueChange={setSelectedModelId} disabled={isExtracting || textModels.length === 0}>
                <SelectTrigger id="director-entity-model"><SelectValue placeholder={modelsQuery.isPending ? '读取模型中…' : '选择文本模型'} /></SelectTrigger>
                <SelectContent>
                  {textModels.map(model => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <Button
              onClick={() => runEntitiesMutation.mutate()}
              disabled={project.storyText.trim().length === 0 || selectedModelId.length === 0 || isExtracting || modelsQuery.isError}
            >
              {isExtracting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
              {isExtracting ? '提取中…' : '提取实体'}
            </Button>
          </div>
          {modelsQuery.isError && <p className="text-sm text-destructive">暂时无法读取文本模型，请稍后重试。</p>}
          {phaseRunQuery.data?.error !== null && phaseRunQuery.data?.error !== undefined && (
            <p className="text-sm text-destructive">{typeof phaseRunQuery.data.error.message === 'string' ? phaseRunQuery.data.error.message : '实体提取失败，请重试。'}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>实体候选</CardTitle>
              <CardDescription>
                {candidatesQuery.isPending ? '正在读取候选…' : `共 ${candidatesQuery.data?.length ?? 0} 个候选，当前显示 ${filteredCandidates.length} 个`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedKind} onValueChange={value => setSelectedKind(value as DirectorEntityCandidateKind | 'all')}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {ENTITY_KINDS.map(kind => <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={value => setSelectedStatus(value as DirectorEntityCandidateStatus | 'all')}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {ENTITY_STATUSES.map(status => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {candidatesQuery.isError && (
            <div className="flex items-center justify-between gap-4 bg-muted/40 px-4 py-5 text-sm">
              <p className="text-muted-foreground">候选实体暂时读取失败。</p>
              <Button variant="outline" size="sm" onClick={() => void candidatesQuery.refetch()}>重新加载</Button>
            </div>
          )}
          {!candidatesQuery.isPending && !candidatesQuery.isError && filteredCandidates.length === 0 && (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 bg-muted/30 px-5 text-center">
              <p className="font-medium">还没有符合条件的候选</p>
              <p className="text-sm leading-6 text-muted-foreground">先运行实体提取，或调整上面的筛选条件。</p>
            </div>
          )}
          {filteredCandidates.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredCandidates.map(candidate => (
                <EntityCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  promoted={promotedCandidateIds.has(candidate.id)}
                  busy={reviewMutation.isPending || deleteMutation.isPending}
                  onReview={status => reviewMutation.mutate({ candidateId: candidate.id, status })}
                  onDelete={() => deleteMutation.mutate(candidate.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function EntityCandidateCard({
  candidate,
  promoted,
  busy,
  onReview,
  onDelete,
}: {
  candidate: DirectorEntityCandidate
  promoted: boolean
  busy: boolean
  onReview: (status: 'accepted' | 'rejected') => void
  onDelete: () => void
}) {
  return (
    <article className="flex flex-col gap-4 border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{candidate.name}</h3>
            <Badge variant="outline">{KIND_LABELS[candidate.kind]}</Badge>
            <Badge variant={statusVariant(candidate.status)}>{STATUS_LABELS[candidate.status]}</Badge>
            {promoted && <Badge variant="secondary">已进入导演实体</Badge>}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{candidate.description || '暂无描述'}</p>
        </div>
      </div>

      {candidate.traits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidate.traits.map(trait => <span key={trait} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{trait}</span>)}
        </div>
      )}

      {candidate.mentions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">原文命中</p>
          <div className="flex flex-wrap gap-2">
            {candidate.mentions.map(mention => <mark key={`${mention.start}-${mention.end}-${mention.text}`} className="bg-primary/10 px-2 py-1 text-xs text-foreground">“{mention.text}”</mark>)}
          </div>
        </div>
      )}

      {promoted && (
        <p className="text-xs leading-5 text-muted-foreground">
          {candidate.kind === 'character' ? '角色' : '场景'}已进入导演实体，可在后续分镜阶段继续挂接参考资产。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" onClick={() => onReview('accepted')} disabled={busy || candidate.status === 'accepted'}>
          {candidate.status === 'accepted' ? <Check data-icon="inline-start" /> : <Check data-icon="inline-start" />}
          {candidate.status === 'accepted' ? '已采纳' : '采纳'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onReview('rejected')} disabled={busy || candidate.status === 'rejected'}>
          {candidate.status === 'rejected' ? <X data-icon="inline-start" /> : <X data-icon="inline-start" />}
          {candidate.status === 'rejected' ? '已忽略' : '忽略'}
        </Button>
        {candidate.status === 'rejected' && (
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="text-muted-foreground">
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
            移除
          </Button>
        )}
        {candidate.status !== 'provisional' && <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw className="size-3" />可重新审核</span>}
      </div>
    </article>
  )
}

function LoadingState() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      正在加载导演项目…
    </main>
  )
}
