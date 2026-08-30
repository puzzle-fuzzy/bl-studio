import { useEffect, useState, type FormEvent } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import type { CreativeProject } from '@bailian-studio/api-client'
import { Button, PageState } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { Label } from '@bailian-studio/ui'
import { Textarea } from '@bailian-studio/ui'
import { useCreateCreativeProject } from '@/hooks/use-creative-projects'
import { notifyError } from '@/lib/toast'

export function ProjectCollection({
  projects,
  isLoading,
  error,
  onRetry,
  onSelect,
  onCreate,
}: {
  projects: CreativeProject[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (project: CreativeProject) => void
  onCreate: () => void
}) {
  useEffect(() => {
    if (error !== null) notifyError(error)
  }, [error])

  if (isLoading && projects.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="正在加载项目">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    )
  }

  if (error && projects.length === 0) {
    return (
      <PageState
        variant="error"
        title="暂时没有可显示的项目"
        description="可以稍后重新加载，或先创建一个新项目。"
        action={<Button variant="outline" onClick={onRetry} title="重新加载项目">重新加载</Button>}
      />
    )
  }

  if (projects.length === 0) {
    return (
      <PageState
        variant="empty"
        title="还没有创作项目"
        description="先用项目把短剧素材分开，之后可以跨项目复用主体、场景和道具。"
        icon={<FolderKanban className="size-6" aria-hidden="true" />}
        action={(
          <Button onClick={onCreate} title="新建创作项目">
            <Plus className="size-4" />
            新建项目
          </Button>
        )}
        className="min-h-80"
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map(project => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelect(project)}
          title={`打开项目：${project.title}`}
          className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-primary">
              <FolderKanban className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{project.title}</h2>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{project.description || '还没有项目描述'}</p>
            </div>
          </div>
          <div className="relative mt-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>{project.status === 'active' ? '活跃项目' : project.status === 'archived' ? '已归档' : '草稿项目'}</span>
            <span>打开项目 →</span>
          </div>
        </button>
      ))}
    </div>
  )
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: CreativeProject) => void
}) {
  const createProject = useCreateCreativeProject()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      notifyError('请输入项目名称')
      return
    }
    setIsSubmitting(true)
    try {
      const project = await createProject({ title: normalizedTitle, ...(description.trim() ? { description: description.trim() } : {}) })
      setTitle('')
      setDescription('')
      onCreated(project)
    } catch (submitError) {
      notifyError(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建创作项目</DialogTitle>
          <DialogDescription>项目用于整理一部短剧或一个系列的主体、场景和道具资产。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="creative-project-title">项目名称</Label>
            <Input id="creative-project-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：夜班便利店" maxLength={120} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creative-project-description">
              项目描述 <span className="font-normal text-muted-foreground">（可选）</span>
            </Label>
            <Textarea id="creative-project-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="记录这个项目的视觉方向或使用范围" maxLength={2_000} rows={4} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} title="取消创建项目">取消</Button>
            <Button type="submit" disabled={isSubmitting} title="创建项目">{isSubmitting ? '正在创建…' : '创建项目'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
