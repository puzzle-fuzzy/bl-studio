import { toast } from 'sonner'

export interface AppMessage {
  title: string
  description?: string
  tone: 'success' | 'warning' | 'info'
}

/**
 * 全局消息（shadcn/sonner 的薄适配）。
 * shadcn/sonner 的薄适配，与 toast.ts 的 notifyError 成对。
 */
export function showMessage(message: AppMessage): void {
  const emitter = message.tone === 'success' ? toast.success : message.tone === 'warning' ? toast.warning : toast.info
  emitter(message.title, message.description !== undefined ? { description: message.description } : undefined)
}
