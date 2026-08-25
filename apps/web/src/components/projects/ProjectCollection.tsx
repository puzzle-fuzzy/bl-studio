import { useState, type FormEvent } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import type { CreativeProject } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreativeProjectsStore } from '@/stores/creative-projects-store'

export function ProjectCollection({
  projects,
  isLoading,
  error,
  onSelect,
  onCreate,
}: {
  projects: CreativeProject[]
  isLoading: boolean
  error: string | null
  onSelect: (project: CreativeProject) => void
  onCreate: () => void
}) {
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
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium">项目暂时加载失败</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
        <FolderKanban className="size-8 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold">还没有创作项目</h2>
        <p className="max-w-md text-sm text-muted-foreground">先用项目把短剧素材分开，之后可以跨项目复用主体、场景和道具。</p>
        <Button onClick={onCreate} title="新建创作项目">
          <Plus className="size-4" />
          新建项目
        </Button>
      </div>
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
  const createProject = useCreativeProjectsStore(state => state.create)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setError(null)
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (normalizedTitle.length === 0) {
      setError('请输入项目名称')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const project = await createProject({ title: normalizedTitle, ...(description.trim() ? { description: description.trim() } : {}) })
      setTitle('')
      setDescription('')
      onCreated(project)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建项目失败，请稍后重试')
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
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} title="取消创建项目">取消</Button>
            <Button type="submit" disabled={isSubmitting} title="创建项目">{isSubmitting ? '正在创建…' : '创建项目'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
