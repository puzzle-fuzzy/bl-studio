import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { router } from './routes'
import { installChunkRecovery } from '@/lib/chunk-recovery'
import { AppQueryProvider } from '@bailian-studio/lib-client'
// 登出清空 react-query 缓存（副作用注册，见 lib/query-reset.ts）。
import '@/lib/query-reset'
import './styles.css'
import 'overlayscrollbars/overlayscrollbars.css'
import './os-theme.css'

// 部署后旧 chunk 被删、客户端仍引用时，动态 import 会 404。index.html 已是
// no-cache，刷新即自愈，这里在渲染前挂全局恢复监听（见 lib/chunk-recovery.ts）。
installChunkRecovery()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <Toaster position="top-right" />
      {/* Tooltip 组件（顶栏主题切换、侧栏折叠提示等）必须在 TooltipProvider 内 */}
      <TooltipProvider delayDuration={0}>
        <AppQueryProvider>
      <RouterProvider router={router} />
    </AppQueryProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
