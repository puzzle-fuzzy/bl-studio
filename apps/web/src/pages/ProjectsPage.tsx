import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ProjectCollection, CreateProjectDialog } from '@/components/projects/ProjectCollection'
import { Button } from '@/components/ui/button'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'

export function ProjectsPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const projectState = useCreativeProjectsStore(state => state.queries[creativeProjectQueryKey()])
  const loadProjects = useCreativeProjectsStore(state => state.load)

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

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
          onRetry={() => void loadProjects({}, true)}
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
