import { useEffect } from 'react'
import { Boxes, Clapperboard, History, LayoutDashboard, LibraryBig, Sparkles, Wrench } from 'lucide-react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { CreativeProject } from '@bailian-studio/api-client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BrandMark } from '@/components/shared/BrandMark'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { UserMenu } from '@/components/layout/UserMenu'
import { creativeProjectQueryKey, useCreativeProjectsStore } from '@/stores/creative-projects-store'

const NAV_GROUPS = [
  {
    label: '工作区',
    items: [
      { to: '/workbench', label: '工作台', icon: LayoutDashboard },
      { to: '/assets', label: '素材库', icon: LibraryBig },
      { to: '/generations', label: '生成记录', icon: History },
    ],
  },
  {
    label: '创作',
    items: [
      { to: '/create', label: '生成素材', icon: Sparkles },
      { to: '/director', label: '导演台', icon: Clapperboard },
    ],
  },
  {
    label: '资源',
    items: [
      { to: '/catalog', label: '模型目录', icon: Boxes },
      { to: '/functions', label: '辅助工具', icon: Wrench },
    ],
  },
] as const

function ProjectSwitcher() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId') ?? 'all'
  const load = useCreativeProjectsStore(state => state.load)
  const query = useCreativeProjectsStore(state => state.queries[creativeProjectQueryKey()])

  useEffect(() => {
    void load()
  }, [load])

  function selectProject(nextProjectId: string) {
    const nextParams = new URLSearchParams(location.search)
    if (nextProjectId === 'all') nextParams.delete('projectId')
    else nextParams.set('projectId', nextProjectId)
    const search = nextParams.toString()
    navigate(`${location.pathname}${search ? `?${search}` : ''}`)
  }

  const projects: CreativeProject[] = query?.items ?? []

  return (
    <div className="px-2 pt-1 group-data-[collapsible=icon]:hidden">
      <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">当前项目</p>
      <Select value={projectId} onValueChange={selectProject}>
        <SelectTrigger className="h-9 w-full bg-background/70 text-xs" aria-label="选择当前项目">
          <SelectValue placeholder="所有项目" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有项目</SelectItem>
          {projects.map(project => (
            <SelectItem key={project.id} value={project.id}>
              {project.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** 主导航侧栏：工作区优先，项目上下文与业务资源分层。 */
export function Nav() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarTrigger className="absolute top-3 right-2 z-10" />
      <SidebarHeader>
        <BrandMark className="px-2 py-1" />
        <ProjectSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label}>
            {index > 0 && <SidebarSeparator className="my-2" />}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.items.map(item => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                        tooltip={item.label}
                      >
                        <NavLink to={item.to}>
                          <item.icon />
                          <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <div className="space-y-1">
          <NotificationMenu />
          <CreditsBadge layout="row" />
          <UserMenu />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
