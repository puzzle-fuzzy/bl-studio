import { createApiClient } from '@bailian-studio/api-client'

/**
 * 唯一的 API 客户端单例。
 *
 * baseUrl 取自 `VITE_API_ORIGIN`：为空时使用同源（开发由 vite 代理 /api，生产由
 * nginx 反代 /api），会话 cookie 同源携带，无需 CORS。跨源部署时显式配置
 * `VITE_API_ORIGIN` 即可。
 */
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_ORIGIN ?? '',
})

/**
 * 把服务端返回的相对媒体 URL 解析为可访问的绝对地址。
 * - 绝对 URL（http/https）原样透传；
 * - `/api/...` 相对地址拼接 API 源；
 * - 其它内容（如 data URL）原样返回。
 */
export function resolveApiUrl(url: string | undefined | null): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${apiBaseOrigin()}${url}`
  return url
}

function apiBaseOrigin(): string {
  const base = import.meta.env.VITE_API_ORIGIN ?? ''
  return base === '' ? window.location.origin : base
}
