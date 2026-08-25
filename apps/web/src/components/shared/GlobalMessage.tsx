import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useNotificationsStore, type GlobalMessage as GlobalMessageValue } from '@/stores/notifications-store'

/**
 * 全局消息桥接：保留 notifications-store 的业务调用协议，统一转为 Sonner 右上角提示。
 */
export function GlobalMessage() {
  const message = useNotificationsStore(state => state.activeMessage)
  const lastMessage = useRef<GlobalMessageValue | null>(null)

  useEffect(() => {
    if (message === null) {
      lastMessage.current = null
      return
    }
    if (lastMessage.current === message) return
    lastMessage.current = message
    const show = message.tone === 'success'
      ? toast.success
      : message.tone === 'warning'
        ? toast.warning
        : toast.info
    show(message.title, { description: message.description })
  }, [message])

  return null
}
