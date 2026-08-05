import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui 的类名合并工具：clsx + tailwind-merge。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 为 DOM id 生成安全标识（去除非 [A-Za-z0-9_-] 字符），避免 manifest 参数名含空格/斜杠。 */
export function safeDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}
