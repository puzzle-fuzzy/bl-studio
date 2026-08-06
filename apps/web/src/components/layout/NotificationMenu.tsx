import { Bell, Bookmark, Heart, Info } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore, type AppNotification } from '@/stores/notifications-store'
import { cn } from '@/lib/utils'

/** 通知中心：服务端社交通知（点赞/收藏）+ 本地官方通知；未读徽标；全部已读。 */
export function NotificationMenu() {
  const navigate = useNavigate()
  const status = useAuthStore(state => state.status)
  const notifications = useNotificationsStore(state => state.notifications)
  const unreadCount = useNotificationsStore(state => state.unreadCount)
  const load = useNotificationsStore(state => state.load)
  const openNotification = useNotificationsStore(state => state.openNotification)
  const markAllRead = useNotificationsStore(state => state.markAllRead)

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  const handleOpen = (notification: AppNotification) => {
    void openNotification(notification.id)
    // 社交通知关联作品：跳画廊查看该作品。
    if (notification.server === true && notification.recordId !== undefined) {
      navigate('/gallery')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* 侧栏底部整行触发器：铃铛 + 通知 + 未读徽标 */}
        <SidebarMenuButton className="w-full">
          <Bell className="size-4" />
          <span>通知</span>
          {unreadCount > 0 && (
            <span className="ml-auto flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>通知</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void markAllRead()}
            >
              全部已读
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无通知</div>
        ) : (
          notifications.map(notification => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-0.5 py-2"
              onClick={() => handleOpen(notification)}
            >
              <span className={cn('flex items-center gap-1.5 text-sm', !notification.read && 'font-medium')}>
                {notificationKindIcon(notification.kind)}
                {notification.title}
                {!notification.read && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
              </span>
              <span className="text-xs text-muted-foreground">{notification.description}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function notificationKindIcon(kind: AppNotification['kind']): React.ReactNode {
  if (kind === 'like') return <Heart data-icon className="size-3.5 shrink-0 text-destructive" />
  if (kind === 'favorite') return <Bookmark data-icon className="size-3.5 shrink-0 text-primary" />
  return <Info data-icon className="size-3.5 shrink-0 text-muted-foreground" />
}
