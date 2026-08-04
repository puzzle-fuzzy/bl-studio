import { Bell } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { cn } from '@/lib/utils'

/** 通知中心：官方通知（模型目录/月度用量），未读徽标，全部已读。 */
export function NotificationMenu() {
  const status = useAuthStore(state => state.status)
  const notifications = useNotificationsStore(state => state.notifications)
  const readIds = useNotificationsStore(state => state.readIds)
  const unreadCount = useNotificationsStore(state => state.unreadCount)
  const load = useNotificationsStore(state => state.load)
  const openNotification = useNotificationsStore(state => state.openNotification)
  const markAllRead = useNotificationsStore(state => state.markAllRead)

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="通知" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>通知</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              全部已读
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无通知</div>
        ) : (
          notifications.map(notification => {
            const read = readIds.includes(notification.id)
            return (
              <DropdownMenuItem
                key={notification.id}
                className="flex flex-col items-start gap-0.5 py-2"
                onClick={() => openNotification(notification.id)}
              >
                <span className={cn('text-sm', !read && 'font-medium')}>
                  {notification.title}
                  {!read && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
                </span>
                <span className="text-xs text-muted-foreground">{notification.description}</span>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
