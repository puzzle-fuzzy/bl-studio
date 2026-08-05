import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useAdminAuthStore } from '@/stores/admin-auth-store'

/** 访客路由守卫：已登录管理员访问登录页时跳回用户列表。 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAdminAuthStore(state => state.status)
  const restore = useAdminAuthStore(state => state.restore)

  useEffect(() => {
    if (status === 'unknown') void restore()
  }, [status, restore])

  if (status === 'authenticated') return <Navigate to="/users" replace />
  return <>{children}</>
}
