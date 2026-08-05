import { Link, Outlet, useNavigate } from 'react-router'
import { BarChart3, ChartPie, LogOut, MessageSquare, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminAuthStore } from '@/stores/admin-auth-store'

/** 管理后台外壳：顶部栏（品牌 + 当前管理员 + 登出）+ 内容区。 */
export function AdminShell() {
  const user = useAdminAuthStore(state => state.user)
  const logout = useAdminAuthStore(state => state.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">Bailian Studio Admin</span>
            <nav className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link to="/users">
                  <Users data-icon />
                  用户管理
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/stats">
                  <BarChart3 data-icon />
                  调用统计
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/analytics">
                  <ChartPie data-icon />
                  分析
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/feedback">
                  <MessageSquare data-icon />
                  反馈
                </Link>
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              <LogOut data-icon />
              退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
