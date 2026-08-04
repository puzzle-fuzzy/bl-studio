import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/auth-store'

/**
 * 受保护路由守卫：未登录跳转登录页并携带安全回跳参数（cb）。
 * 已登录时渲染应用外壳（AppShell 内含 <Outlet/>），子路由在其内部渲染。
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

  return <AppShell />
}
