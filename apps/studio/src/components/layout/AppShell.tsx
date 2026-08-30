import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { VirtualScrollArea } from '@/components/ui/virtual-scroll-area'
import { Nav } from '@/components/layout/Nav'
import { AuthDialog } from '@bailian-studio/app-shell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useAuthStore } from '@bailian-studio/app-shell'
import { useGenerationEvents } from '@/hooks/use-generation-events'

/**
 * 已登录应用外壳：侧栏（导航 + 底部通知/积分/账户）+ 内容区。
 * 折叠按钮位于内容区顶部工具条，不遮挡侧栏 Logo，也能在移动端打开侧栏抽屉。
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
        <div className="flex min-h-svh min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b border-border/70 bg-background/90 px-3 backdrop-blur md:px-3">
            <SidebarTrigger aria-label="展开或收起侧边栏" title="展开或收起侧边栏" className="p-0!" />
          </header>
          <VirtualScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="p-4 md:p-6">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </div>
          </VirtualScrollArea>
        </div>
      </SidebarInset>
      <AuthDialog />
    </SidebarProvider>
  )
}
