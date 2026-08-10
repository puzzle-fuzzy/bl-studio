import { useNotificationsStore } from '@/stores/notifications-store'
import { cn } from '@/lib/utils'

/**
 * 全局单例消息条（继承 Vue 版 GlobalMessage）。
 * 业务反馈经 notifications-store 的 showMessage 触发；tone 映射为语义色。
 */
const TONE_CLASSES: Record<string, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

export function GlobalMessage() {
  const message = useNotificationsStore(state => state.activeMessage)
  const dismiss = useNotificationsStore(state => state.dismissMessage)

  if (message === null) return null

  return (
    <button
      type="button"
      aria-live="polite"
      className={cn(
        'fixed top-4 left-1/2 z-[100] -translate-x-1/2 rounded-lg border bg-transparent px-4 py-2.5 text-left text-sm shadow-sm',
        TONE_CLASSES[message.tone] ?? TONE_CLASSES.info,
      )}
      onClick={dismiss}
    >
      <strong className="font-medium">{message.title}</strong>
      {message.description !== undefined && (
        <span className="ml-2 text-xs opacity-80">{message.description}</span>
      )}
    </button>
  )
}
