import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAdminAuthStore } from '@/stores/admin-auth-store'

/**
 * 管理后台路由守卫：恢复会话后要求 admin 角色，否则按未认证处理并重定向到登录页。
 * 当前产品没有单独的 403 页面，API 层仍会对受保护请求返回 403。
 */
export function ProtectedAdminRoute() {
  const status = useAdminAuthStore(state => state.status)
  const restore = useAdminAuthStore(state => state.restore)

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
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
