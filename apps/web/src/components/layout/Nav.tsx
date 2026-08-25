import { Boxes, Clapperboard, FolderKanban, History, LayoutDashboard, LibraryBig, Sparkles, Wrench } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
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
} from '@/components/ui/sidebar'
import { LoginWordmark } from '@/components/auth/LoginWordmark'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { UserMenu } from '@/components/layout/UserMenu'

const NAV_GROUPS = [
  {
    label: '工作区',
    items: [
      { to: '/workbench', label: '工作台', icon: LayoutDashboard },
      { to: '/projects', label: '项目', icon: FolderKanban },
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

/** 主导航侧栏：工作区优先，项目上下文与业务资源分层。 */
export function Nav() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex min-h-14 w-full items-center justify-center px-2 py-1">
          <div className="group-data-[collapsible=icon]:hidden" aria-hidden="true">
            <LoginWordmark className="login-wordmark--sidebar" />
          </div>
          <div className="hidden group-data-[collapsible=icon]:block" aria-hidden="true">
            <LoginWordmark compact />
          </div>
          <span className="sr-only">Bailian Studio</span>
        </div>
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
      <SidebarFooter className="border-t p-2 group-data-[collapsible=icon]:p-1.5">
        <div className="space-y-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <NotificationMenu />
          <CreditsBadge layout="row" />
          <UserMenu />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
