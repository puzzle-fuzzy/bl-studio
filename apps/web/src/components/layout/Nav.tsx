import { Brush, Clapperboard, Library, Sparkles, Wrench } from 'lucide-react'
import { NavLink } from 'react-router'
import {
  Sidebar,
  SidebarContent,
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
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/create', label: '创作', icon: Brush },
  { to: '/catalog', label: '模型目录', icon: Sparkles },
  { to: '/generations', label: '任务', icon: Clapperboard },
  { to: '/functions', label: '辅助工具', icon: Wrench },
  { to: '/library', label: '作品库', icon: Library },
]

/** 主导航侧栏。 */
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
      <SidebarRail />
    </Sidebar>
  )
}
