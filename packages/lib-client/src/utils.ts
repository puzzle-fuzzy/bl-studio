import { cn } from '@bailian-studio/ui'

export { cn }

/** 为 DOM id 生成安全标识（去除非 [A-Za-z0-9_-] 字符），避免 manifest 参数名含空格/斜杠。 */
export function safeDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}
