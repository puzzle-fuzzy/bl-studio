import { isRouteErrorResponse, useRouteError } from 'react-router'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 路由级兜底：懒加载 chunk 失败 / loader 异常时显示恢复 UI，而不是白屏。
 * 被 React Router 的 errorElement 挂在根布局，覆盖没有 AppShell ErrorBoundary
 * 的访客路由（登录/认证/分享页）。
 */
export function RouteErrorElement() {
  const error = useRouteError()

  let message = '页面加载失败'
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`
  } else if (error instanceof Error && error.message.length > 0) {
    message = error.message
  }

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="max-w-md text-xs text-muted-foreground/70">
        页面加载失败，刷新可重新加载最新版本（部署更新时浏览器缓存会自动失效）。
      </p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RotateCcw data-icon />
        刷新页面
      </Button>
    </div>
  )
}
