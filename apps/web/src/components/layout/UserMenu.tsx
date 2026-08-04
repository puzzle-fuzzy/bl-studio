import { useState } from 'react'
import { LogIn, LogOut, KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router'
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
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { CreditsBadge } from '@/components/layout/CreditsBadge'
import { useAuthStore } from '@/stores/auth-store'
import { useAuthDialogStore } from '@/stores/auth-dialog-store'

/** 账户菜单：未登录显示登录入口；已登录显示积分、修改密码、退出。 */
export function UserMenu() {
  const user = useAuthStore(state => state.user)
  const status = useAuthStore(state => state.status)
  const logout = useAuthStore(state => state.logout)
  const logoutAll = useAuthStore(state => state.logoutAll)
  const openAuth = useAuthDialogStore(state => state.open)
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="账户菜单">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="space-y-0.5">
            <span className="block truncate text-sm">{user.displayName ?? user.email}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <CreditsBadge />
          </div>
          <DropdownMenuSeparator />
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
