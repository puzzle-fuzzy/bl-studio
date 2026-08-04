import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

/** 访客路由守卫：已登录用户访问登录/注册页时跳回首页。 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAuthStore(state => state.status)
  const restore = useAuthStore(state => state.restore)

  useEffect(() => {
    if (status === 'unknown') void restore()
  }, [status, restore])

  if (status === 'authenticated') return <Navigate to="/create" replace />
  return <>{children}</>
}
