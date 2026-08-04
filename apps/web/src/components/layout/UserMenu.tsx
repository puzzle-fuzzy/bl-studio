import { useState } from 'react'
import { LogIn, LogOut, KeyRound, Moon, Sun } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTheme } from 'next-themes'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { useAuthStore } from '@/stores/auth-store'
import { useAuthDialogStore } from '@/stores/auth-dialog-store'

/**
 * 账户菜单（侧栏底部）：头像 + 完整邮箱，下拉含积分、主题切换、修改密码、退出。
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
  const [changeOpen, setChangeOpen] = useState(false)

  if (status !== 'authenticated' || user === null) {
    return (
      <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>
        <LogIn data-icon />
        登录
      </Button>
    )
  }

  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase()
  const isDark = resolvedTheme === 'dark'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton className="h-auto w-full min-w-0">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-medium">{user.displayName ?? user.email}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <span className="block truncate text-sm">{user.displayName ?? user.email}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <CreditsBadge />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme(isDark ? 'light' : 'dark')}>
            {isDark ? <Sun data-icon /> : <Moon data-icon />}
            {isDark ? '浅色模式' : '深色模式'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setChangeOpen(true)}>
            <KeyRound data-icon />
            修改密码
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void logout()
              navigate('/create')
            }}
          >
            <LogOut data-icon />
            退出登录
          </DropdownMenuItem>
          <DropdownMenuItem
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
      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </>
  )
}
