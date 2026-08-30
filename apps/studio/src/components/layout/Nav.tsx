import { Boxes, Clapperboard, FolderKanban, History, ImagePlus, LayoutDashboard, LibraryBig, Mountain, Package, UserRound, Wrench } from 'lucide-react'
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
import { LoginWordmark } from '@bailian-studio/app-shell'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { UserMenu } from '@/components/layout/UserMenu'

const NAV_GROUPS = [
  {
    label: '工作区',
    items: [
      { to: '/workbench', label: '工作台', icon: LayoutDashboard },
      { to: '/projects', label: '项目', icon: FolderKanban },
      { to: '/assets', label: '资产', icon: LibraryBig },
      { to: '/generations', label: '生成记录', icon: History },
    ],
  },
  {
    label: '创作',
    items: [
      { to: '/create?assetType=asset', label: '创建资产', icon: ImagePlus },
      { to: '/create?assetType=character', label: '创建人物', icon: UserRound },
      { to: '/create?assetType=environment', label: '创建场地', icon: Mountain },
      { to: '/create?assetType=prop', label: '创建道具', icon: Package },
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
  const { pathname, search } = useLocation()

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
                        isActive={isNavItemActive(item.to, pathname, search)}
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

function isNavItemActive(to: string, pathname: string, search: string): boolean {
  const [itemPath, itemQuery] = to.split('?')
  if (itemQuery !== undefined) {
    const expectedType = new URLSearchParams(itemQuery).get('assetType')
    return pathname === itemPath && new URLSearchParams(search).get('assetType') === expectedType
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}
