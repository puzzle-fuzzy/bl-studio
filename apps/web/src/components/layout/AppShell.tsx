import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { Nav } from '@/components/layout/Nav'
import { GlobalMessage } from '@/components/shared/GlobalMessage'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAuthStore } from '@/stores/auth-store'
import { useGenerationEvents } from '@/hooks/use-generation-events'

/**
 * 已登录应用外壳：侧栏（导航 + 底部通知/积分/账户）+ 内容区。
 * 顶栏已移除：折叠按钮以 fixed 悬浮在内容区左上角（跟随侧栏宽度偏移）。
 * 在此层挂载一次 SSE 订阅（跨路由常开）与全局弹层。
 */
export function AppShell() {
  const status = useAuthStore(state => state.status)

  // 登录态确定后开启 SSE；未登录（公开页）不订阅。
  useGenerationEvents(status === 'authenticated')

  return (
    <SidebarProvider>
      <Nav />
      <SidebarInset>
        <SidebarTrigger className="fixed top-3 left-[calc(var(--sidebar-width)+0.75rem)] z-20" />
        <main className="flex-1 overflow-auto p-4 pt-14 md:p-6 md:pt-14">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </SidebarInset>
      <GlobalMessage />
      <AuthDialog />
      <Toaster position="top-right" />
    </SidebarProvider>
  )
}
