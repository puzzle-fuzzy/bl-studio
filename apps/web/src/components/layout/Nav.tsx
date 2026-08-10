import { Bookmark, Brush, Images, Library, PenLine, Sparkles, Wrench } from 'lucide-react'
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
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { BrandMark } from '@/components/shared/BrandMark'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { UserMenu } from '@/components/layout/UserMenu'

// 主导航：画廊即「首页」置顶；任务列表已并入创作页「最新任务」；作品库改名「资产」；模型目录改名「全部模型」。
const NAV_ITEMS = [
  { to: '/gallery', label: '首页', icon: Images },
  { to: '/create', label: '创作', icon: Brush },
  { to: '/writing', label: '写作', icon: PenLine },
  { to: '/catalog', label: '全部模型', icon: Sparkles },
  { to: '/prompts', label: '提示词', icon: Bookmark },
  { to: '/functions', label: '辅助工具', icon: Wrench },
  { to: '/library', label: '资产', icon: Library },
]

/** 主导航侧栏。折叠按钮 absolute 相对侧边栏（随其移动）；底部通知/积分/账户。 */
export function Nav() {
  const { pathname } = useLocation()

  return (
    <Sidebar>
      {/* 折叠按钮相对侧边栏定位，侧边栏收缩时随之平移（不再是 fixed） */}
      <SidebarTrigger className="absolute top-3 right-2 z-10" />
      <SidebarHeader>
        <BrandMark className="px-2 py-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_ITEMS.map(item => (
                <SidebarMenuItem key={item.to}>
                  {/* 选中态由当前路径判断（含子路由前缀，如 /generations/:id） */}
                  <SidebarMenuButton asChild isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}>
                    <NavLink to={item.to}>
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
      {/* 侧栏底部：通知一行 / 积分一行 / 头像+邮箱一行，各自独立 */}
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
