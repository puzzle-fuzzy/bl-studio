import { useEffect, useMemo, useState } from 'react'
import { Check, FolderKanban, Loader2, Search } from 'lucide-react'
import type { CreativeProject } from '@bailian-studio/api-client'
import { Button } from '@bailian-studio/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bailian-studio/ui'
import { Input } from '@bailian-studio/ui'
import { notifyError } from '@/lib/toast'

export function CreativeAssetProjectDialog({
  open,
  onOpenChange,
  projects,
  initialProjectIds,
  isLoadingProjects,
  projectError,
  onRetryProjects,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: CreativeProject[]
  initialProjectIds: readonly string[]
  isLoadingProjects: boolean
  projectError: string | null
  onRetryProjects: () => void
  onSubmit: (projectIds: string[]) => Promise<void>
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialProjectKey = initialProjectIds.join('\u0000')

  useEffect(() => {
    if (!open) return
    setSelectedProjectIds(new Set(initialProjectKey.length === 0 ? [] : initialProjectKey.split('\u0000')))
    setQuery('')
  }, [initialProjectKey, open])

  useEffect(() => {
    if (projectError !== null) notifyError(projectError)
  }, [projectError])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (normalizedQuery.length === 0) return projects
    return projects.filter(project => [project.title, project.description ?? ''].some(value => value.toLocaleLowerCase().includes(normalizedQuery)))
  }, [projects, query])

  function toggleProject(projectId: string) {
    setSelectedProjectIds(current => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await onSubmit([...selectedProjectIds])
      onOpenChange(false)
    } catch (submitError) {
      notifyError(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>管理所属项目</DialogTitle>
          <DialogDescription>一个素材可以被多个项目复用。这里只调整项目归属，不会复制或删除素材。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <label htmlFor="asset-project-search" className="sr-only">搜索项目</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="asset-project-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目名称" className="pl-9" title="搜索项目名称" />
          </div>

          <div aria-live="polite" className="text-xs text-muted-foreground">已选择 {selectedProjectIds.size} 个项目</div>

          {projectError !== null ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center" role="status">
              <p className="text-sm font-medium">暂时无法读取项目列表</p>
              <p className="text-xs text-muted-foreground">错误详情已通过右上角通知显示。</p>
              <Button type="button" size="sm" variant="outline" onClick={onRetryProjects} title="重新加载项目列表">重新加载</Button>
            </div>
          ) : isLoadingProjects ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground" role="status" aria-label="正在加载项目">
              <Loader2 className="mr-2 size-4 animate-spin" />正在加载项目
            </div>
          ) : projects.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
              <FolderKanban className="size-7" />
              <p>还没有可用项目</p>
              <p className="text-xs">请先在素材库创建一个项目。</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
              <Search className="size-7" />
              <p>没有匹配的项目</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')} title="清除项目搜索">清除搜索</Button>
            </div>
          ) : (
            <fieldset className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              <legend className="sr-only">项目列表</legend>
              {filteredProjects.map(project => {
                const isSelected = selectedProjectIds.has(project.id)
                return (
                  <label key={project.id} title={`${isSelected ? '取消选择' : '选择'}项目：${project.title}`} className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/70 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleProject(project.id)} aria-label={`${isSelected ? '取消选择' : '选择'}项目 ${project.title}`} className="sr-only" />
                    <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border text-primary-foreground ${isSelected ? 'border-primary bg-primary' : 'border-input bg-background'}`}>{isSelected && <Check className="size-3" />}</span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/70 text-primary"><FolderKanban className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.title}</span><span className="block truncate text-xs text-muted-foreground">{project.description || '暂无项目描述'}</span></span>
                    {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  </label>
                )
              })}
            </fieldset>
          )}

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} title="取消项目归属修改">取消</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={projectError !== null || isLoadingProjects || isSubmitting} title="保存素材的项目归属">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            保存项目归属
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
