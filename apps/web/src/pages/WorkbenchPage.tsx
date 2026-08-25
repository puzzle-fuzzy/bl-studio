import { useEffect } from 'react'
import { ArrowRight, FolderKanban, LibraryBig, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'
import { creativeAssetQueryKey, useCreativeAssetsStore } from '@/stores/creative-assets-store'
import { creativeAssetTypeLabel } from '@/lib/labels'

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  archived: '已归档',
}

function ProjectSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  )
}

export function WorkbenchPage() {
  const projectQuery = useCreativeProjectsStore(state => state.queries[creativeProjectQueryKey()])
  const loadProjects = useCreativeProjectsStore(state => state.load)
  const assetQueryKey = creativeAssetQueryKey({})
  const assetQuery = useCreativeAssetsStore(state => state.queries[assetQueryKey])
  const loadAssets = useCreativeAssetsStore(state => state.load)

  useEffect(() => {
    void loadProjects()
    void loadAssets({})
  }, [loadAssets, loadProjects])

  const projects = projectQuery?.items ?? []
  const recentAssets = (assetQuery?.items ?? []).slice(0, 6)

  return (
    <div className="relative min-h-full overflow-hidden py-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_0%,oklch(0.82_0.08_330/0.2),transparent_34%),radial-gradient(circle_at_15%_45%,oklch(0.8_0.06_70/0.12),transparent_30%)]" />
      <div className="mx-auto w-full max-w-[1660px] space-y-10">
        <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Studio workspace</p>
            <h1 className="text-3xl font-semibold tracking-tight">工作台</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              从项目进入素材库，维护主体、场景、道具与风格的稳定版本，再把它们带入生成。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/assets">
                <LibraryBig />
                打开素材库
              </Link>
            </Button>
            <Button asChild>
              <Link to="/create">
                <Sparkles />
                开始生成
              </Link>
            </Button>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">项目</h2>
              <p className="mt-1 text-sm text-muted-foreground">项目是整理素材的第一层上下文。</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assets?tab=projects">
                管理项目
                <ArrowRight />
              </Link>
            </Button>
          </div>

          {projectQuery?.error ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-5 text-sm text-destructive">项目加载失败：{projectQuery.error}</CardContent>
            </Card>
          ) : projectQuery?.isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              <ProjectSkeleton />
              <ProjectSkeleton />
              <ProjectSkeleton />
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed bg-card/60">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FolderKanban className="size-5" />
                </div>
                <div>
                  <p className="font-medium">还没有项目</p>
                  <p className="mt-1 text-sm text-muted-foreground">先建立一个项目，再把素材按剧集或视觉主题归档。</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/assets?tab=projects">
                    <Plus />
                    创建第一个项目
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.slice(0, 6).map(project => (
                <Link key={project.id} to={`/assets/projects/${encodeURIComponent(project.id)}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <CardTitle className="line-clamp-1">{project.title}</CardTitle>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                        </span>
                      </div>
                      <CardDescription className="line-clamp-2 min-h-10">
                        {project.description || '暂无项目说明'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FolderKanban className="size-3.5" />
                      查看项目素材
                      <ArrowRight className="ml-auto size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">最近素材</h2>
              <p className="mt-1 text-sm text-muted-foreground">继续处理最近创建或更新的创意资产。</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assets">
                查看全部
                <ArrowRight />
              </Link>
            </Button>
          </div>

          {assetQuery?.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : assetQuery?.error ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-5 text-sm text-destructive">素材加载失败：{assetQuery.error}</CardContent>
            </Card>
          ) : recentAssets.length === 0 ? (
            <Card className="border-dashed bg-card/60">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                还没有创意资产。创建主体、场景、道具或风格后，它们会出现在这里。
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentAssets.map(asset => (
                <Link key={asset.id} to={`/assets/${asset.id}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/50">
                    <CardContent className="flex min-h-24 items-center gap-4 py-4">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-[11px] text-muted-foreground">
                        {creativeAssetTypeLabel(asset.type)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{asset.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {asset.latestVersion ? `V${asset.latestVersion.version} · ${asset.latestVersion.status}` : '暂无版本'}
                        </p>
                      </div>
                      <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
