import { toast } from 'sonner'
import { userErrorMessage } from './user-error'

let lastErrorKey = ''
let lastErrorAt = 0

/** 统一的用户错误反馈入口；所有错误都交给全局右上角 toast，避免改变页面布局。 */
export function notifyError(error: unknown): string {
  const message = typeof error === 'string' ? error : userErrorMessage(error)
  const now = Date.now()
  if (message === lastErrorKey && now - lastErrorAt < 800) return message
  lastErrorKey = message
  lastErrorAt = now
  toast.error(message)
  return message
}
