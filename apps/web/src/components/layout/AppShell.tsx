import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { Nav } from '@/components/layout/Nav'
import { GlobalMessage } from '@/components/shared/GlobalMessage'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAuthStore } from '@/stores/auth-store'
import { useGenerationEvents } from '@/hooks/use-generation-events'

/**
 * 已登录应用外壳：侧栏（导航 + 底部通知/账户）+ 顶栏（仅折叠开关）+ 内容区。
 * 在此层挂载一次 SSE 订阅（跨路由常开）与全局弹层。
 * 通知 / 主题切换 / 账户已移入侧栏底部，顶栏保持极简。
 */
export function AppShell() {
  const status = useAuthStore(state => state.status)

  // 登录态确定后开启 SSE；未登录（公开页）不订阅。
  useGenerationEvents(status === 'authenticated')

  return (
    <SidebarProvider>
      <Nav />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
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
