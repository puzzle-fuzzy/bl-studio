/**
 * 动态 import / 预加载失败自愈。
 *
 * 背景：Vite 产物按内容哈希命名，部署重建后旧 chunk 被物理删除（dist 烤进镜像，
 * 容器替换即删旧文件）。仍持有旧 shell 的客户端（缓存旧 index.html、tab 跨部署
 * 未关、bfcache/内存里的旧模块图）懒加载时会对已删除的 chunk 命中 404，抛
 * 「Failed to fetch dynamically imported module: …/assets/GenerationDetailPage-*.js」，
 * 且应用内「重试」若只 setState 不刷新，会反复重试同一个缺失 chunk。
 *
 * index.html 已是 no-cache（见 infra/nginx/bailian-studio.conf），重新加载必然
 * revalidate 取到新 shell、引用新哈希 chunk——因此「失败后 reload 一次」即可自愈。
 * 用 sessionStorage 守卫「本会话最多自动 reload 一次」，避免服务端真出问题时无限
 * 重载；之后由错误边界 / errorElement 的「刷新页面」（真 reload）兜底。
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
  // Vite 预加载失败（modulepreload）：官方事件，Vite 在 window 上派发。
  window.addEventListener('vite:preloadError', () => {
    reloadOnce()
  })
  // 未被 React 消费的动态 import 失败会冒泡为 unhandledrejection。
  window.addEventListener('unhandledrejection', (event) => {
    notifyChunkLoadFailure(event.reason)
  })
  // 捕获传统 <script> 资源 404（防 MIME/资源策略拦截导致的加载失败）。
  window.addEventListener('error', (event) => {
    if (event.target instanceof HTMLElement && event.target.tagName === 'SCRIPT') {
      reloadOnce()
    }
  })
}
