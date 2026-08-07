/**
 * 动态 import / 预加载失败自愈（与 apps/web 同款）。
 *
 * 背景：Vite 产物按内容哈希命名，部署重建后旧 chunk 被物理删除。仍持有旧 shell
 * 的客户端懒加载时会对已删除的 chunk 命中 404。index.html 已是 no-cache，刷新即
 * revalidate 到最新构建；因此「失败后 reload 一次」即可自愈，sessionStorage 守卫
 * 防死循环。后续由错误边界 / errorElement 的「刷新页面」兜底。
 */

const RELOAD_KEY = 'app:chunk-reload-attempted'

/** 只匹配「chunk/module 静态资源」加载失败，不误伤 API fetch 的网络错误。 */
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload module script/i,
  /Loading chunk .* failed/i,
  /Unable to preload CSS/i,
]

export function isChunkLoadError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

function reloadOnce(): void {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) !== null) return // 本会话已自动 reload 过一次
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    // sessionStorage 不可用（隐私模式等）时退化：仍 reload 一次，无守卫。
  }
  window.location.reload()
}

/** 供懒加载 loader 的 catch 处调用：识别为 chunk 错误时触发守卫式 reload。 */
export function notifyChunkLoadFailure(reason: unknown): void {
  if (!isChunkLoadError(reason)) return
  reloadOnce()
}

/** 在应用渲染前挂载全局监听（main.tsx）。 */
export function installChunkRecovery(): void {
  window.addEventListener('vite:preloadError', () => {
    reloadOnce()
  })
  window.addEventListener('unhandledrejection', (event) => {
    notifyChunkLoadFailure(event.reason)
  })
  window.addEventListener('error', (event) => {
    if (event.target instanceof HTMLElement && event.target.tagName === 'SCRIPT') {
      reloadOnce()
    }
  })
}
