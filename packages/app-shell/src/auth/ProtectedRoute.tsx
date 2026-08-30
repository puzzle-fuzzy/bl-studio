import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../stores/auth-store'

/**
 * 受保护路由守卫：未登录跳转登录页并携带安全回跳参数（cb）。
 * 已登录直接渲染 <Outlet/>——应用外壳由各 app 的布局路由自行包裹
 * （studio 用 AppShell，writer 用自己的编辑器壳），守卫与壳解耦。
 */
export function ProtectedRoute() {
  const status = useAuthStore(state => state.status)
  const restore = useAuthStore(state => state.restore)
  const location = useLocation()

  useEffect(() => {
    if (status === 'unknown') void restore()
  }, [status, restore])

  if (status === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        正在恢复会话…
      </div>
    )
  }

  if (status === 'anonymous') {
    const callback = `${location.pathname}${location.search}`
    return <Navigate to={`/login?cb=${encodeURIComponent(callback)}`} replace />
  }

  return <Outlet />
}
