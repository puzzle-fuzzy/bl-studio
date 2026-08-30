import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './routes'
import { installChunkRecovery } from '@/lib/chunk-recovery'
import { AppQueryProvider } from '@bailian-studio/lib-client'
import './styles.css'

// 部署后旧 chunk 被删、客户端仍引用时，动态 import 会 404。index.html 已是
// no-cache，刷新即自愈，这里在渲染前挂全局恢复监听（见 lib/chunk-recovery.ts）。
installChunkRecovery()

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppQueryProvider>
      <RouterProvider router={router} />
    </AppQueryProvider>
  </StrictMode>,
)
