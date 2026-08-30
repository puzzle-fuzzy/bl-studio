import { useEffect, useState } from 'react'
import { ArrowRight, Clock3, Loader2, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { DirectorProjectSummary } from '@bailian-studio/api-client'
import { DIRECTOR_PHASE_LABELS } from '@bailian-studio/api-client'
import { toast } from 'sonner'
import { Button } from '@bailian-studio/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@bailian-studio/ui'
import { Separator } from '@bailian-studio/ui'
import { Skeleton } from '@bailian-studio/ui'
import { apiClient } from '@/lib/api'
import { notifyError } from '@/lib/toast'

const STATUS_LABELS: Record<DirectorProjectSummary['status'], string> = {
  draft: '草稿',
  active: '制作中',
  completed: '已完成',
  archived: '已归档',
}

export function DirectorPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<DirectorProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadProjects = async () => {
    setLoading(true)
    setError(undefined)
    try {
      const result = await apiClient.listDirectorProjects({ limit: 50 })
      setProjects(result.items)
    } catch (loadError) {
      notifyError(loadError)
      setError('load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    try {
      const project = await apiClient.createDirectorProject({
        title: '未命名短剧',
        storyText: '',
      })
      toast.success('导演台项目已创建')
      setDialogOpen(false)
      navigate(`/director/${project.id}`)
    } catch (createError) {
      notifyError(createError)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            <span>导演台 · 手动制作流程</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">把灵感拆成一部可控的短剧</h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            从剧本分析、角色与场景，到分镜、视频和合成，每一步都由你确认后继续。
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus data-icon="inline-start" />
              新建项目
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>新建导演台项目</DialogTitle>
              <DialogDescription>先创建一个空白项目，进入后直接和编剧对话，剧本会在每次对话后自动整理为标准格式。</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={createProject}>
              <div className="flex flex-col gap-2 bg-muted/40 px-4 py-5">
                <p className="font-medium">从一句话开始，剩下的交给对话</p>
                <p className="text-sm leading-6 text-muted-foreground">项目会自动创建一个空白剧本。进入后，你只需要在聊天框里告诉编剧想写什么、改什么，标准剧本会随着每次对话更新。</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ArrowRight data-icon="inline-start" />}
                  创建并进入
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Separator />

      <section aria-labelledby="director-projects-title" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="director-projects-title" className="text-lg font-semibold">我的项目</h2>
            <p className="text-sm text-muted-foreground">所有项目均保存到你的账号下，阶段结果不会覆盖历史版本。</p>
          </div>
          {!loading && <span className="text-sm tabular-nums text-muted-foreground">{projects.length} 个项目</span>}
        </div>

        {loading && (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        )}

        {!loading && error !== undefined && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 p-5 text-sm">
            <p className="text-muted-foreground">暂时无法读取导演台项目，请稍后重试。</p>
            <Button variant="outline" size="sm" onClick={() => void loadProjects()}>重新加载</Button>
          </div>
        )}

        {!loading && error === undefined && projects.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <h3 className="font-medium">还没有导演台项目</h3>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">从一段故事原文开始，先建立项目，再逐步确认角色、场景和分镜。</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              创建第一个项目
            </Button>
          </div>
        )}

        {!loading && error === undefined && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map(project => (
              <button
                key={project.id}
                type="button"
                className="group flex min-h-44 flex-col gap-5 bg-background p-5 text-left transition-colors hover:bg-muted/40"
                onClick={() => navigate(`/director/${project.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="truncate text-base font-semibold">{project.title}</h3>
                    <span className="text-xs text-muted-foreground">{STATUS_LABELS[project.status]}</span>
                  </div>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>制作进度</span>
                    <span className="tabular-nums">{project.progress.completed}/{project.progress.total}</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: project.progress.total }, (_, index) => (
                      <span key={index} className={`h-1.5 flex-1 rounded-full ${index < project.progress.completed ? 'bg-primary' : 'bg-muted'}`} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    <span>当前阶段：{project.progress.currentPhase === null ? '已完成' : DIRECTOR_PHASE_LABELS[project.progress.currentPhase]}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
