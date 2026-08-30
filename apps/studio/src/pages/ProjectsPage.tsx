import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ProjectCollection, CreateProjectDialog } from '@/components/projects/ProjectCollection'
import { Button } from '@bailian-studio/ui'
import { useCreativeProjectList } from '@/hooks/use-creative-projects'
import { userErrorMessage } from '@/lib/user-error'

export function ProjectsPage() {
  const projectList = useCreativeProjectList()
    const projectState = {
      items: projectList.data?.pages.flatMap(page => page.items) ?? [],
      isLoading: projectList.isPending,
      error: projectList.error !== null ? userErrorMessage(projectList.error) : null,
    }
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const projects = projectState?.items ?? []

  return (
    <div className="relative isolate min-h-[calc(100svh-3rem)] overflow-hidden">
      <div className="relative z-10 mx-auto flex w-full max-w-[1660px] flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>PROJECTS</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">项目</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">项目是短剧素材的组织上下文，集中管理主体、场景和道具，并在项目详情中批量整理它们。</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} title="新建创作项目">
            <Plus className="size-4" />
            新建项目
          </Button>
        </header>

        <ProjectCollection
          projects={projects}
          isLoading={projectState?.isLoading ?? false}
          error={projectState?.error ?? null}
          onRetry={() => void projectList.refetch()}
          onSelect={project => navigate(`/projects/${encodeURIComponent(project.id)}`)}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={project => {
          setCreateOpen(false)
          navigate(`/projects/${encodeURIComponent(project.id)}`)
        }}
      />
    </div>
  )
}
