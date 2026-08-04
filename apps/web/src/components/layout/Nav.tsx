import { Brush, Library, Sparkles, Wrench } from 'lucide-react'
import { NavLink } from 'react-router'
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
} from '@/components/ui/sidebar'
import { BrandMark } from '@/components/shared/BrandMark'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { UserMenu } from '@/components/layout/UserMenu'
import { cn } from '@/lib/utils'

// 主导航：任务列表已并入创作页「最新任务」，不再单独占菜单项；作品库改名「资产」。
const NAV_ITEMS = [
  { to: '/create', label: '创作', icon: Brush },
  { to: '/catalog', label: '模型目录', icon: Sparkles },
  { to: '/functions', label: '辅助工具', icon: Wrench },
  { to: '/library', label: '资产', icon: Library },
]

/** 主导航侧栏。底部固定通知 + 账户（头像 + 完整邮箱）。 */
export function Nav() {
  return (
    <Sidebar>
      <SidebarHeader>
        <BrandMark className="px-2 py-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(item => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={item.to === '/create'}>
                    <NavLink to={item.to} className={({ isActive }) => cn(isActive && 'bg-sidebar-accent')}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center gap-1 p-1.5">
          <NotificationMenu />
          <UserMenu />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
