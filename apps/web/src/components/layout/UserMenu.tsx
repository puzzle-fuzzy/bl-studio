import { useState } from 'react'
import { LogIn, LogOut, MessageSquare, Moon, Sun, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTheme } from 'next-themes'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { useAuthStore } from '@/stores/auth-store'
import { useAuthDialogStore } from '@/stores/auth-dialog-store'

/**
 * 账户菜单（侧栏底部）：头像 + 完整邮箱，下拉含积分、主题切换、个人信息、退出。
 * 未登录时显示登录入口。
 */
export function UserMenu() {
  const user = useAuthStore(state => state.user)
  const status = useAuthStore(state => state.status)
  const logout = useAuthStore(state => state.logout)
  const logoutAll = useAuthStore(state => state.logoutAll)
  const openAuth = useAuthDialogStore(state => state.open)
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  if (status !== 'authenticated' || user === null) {
    return (
      <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>
        <LogIn data-icon />
        登录
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            aria-label={`账户：${user.displayName ?? user.email}`}
            className="h-auto w-full min-w-0 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0!"
            title="账户"
          >
            <UserAvatar userId={user.id} name={user.displayName} className="size-7 shrink-0 group-data-[collapsible=icon]:size-8!" />
            <span className="min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-medium">{user.displayName ?? user.email}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 p-1.5">
          <DropdownMenuLabel className="space-y-0.5">
            <span className="block truncate text-sm">{user.displayName ?? user.email}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <CreditsBadge />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="py-2" onClick={() => setTheme(isDark ? 'light' : 'dark')}>
            {isDark ? <Sun data-icon /> : <Moon data-icon />}
            {isDark ? '浅色模式' : '深色模式'}
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2" onClick={() => navigate('/settings')}>
            <UserRound data-icon />
            个人信息
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2" onClick={() => setFeedbackOpen(true)}>
            <MessageSquare data-icon />
            意见反馈
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2"
            onClick={() => {
              void logout()
              navigate('/create')
            }}
          >
            <LogOut data-icon />
            退出登录
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2"
            onClick={() => {
              void logoutAll()
              navigate('/create')
            }}
          >
            <LogOut data-icon />
            退出所有设备
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
