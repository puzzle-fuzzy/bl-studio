import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from './components/ui/sonner'
import { AppQueryProvider } from '@bailian-studio/lib-client'
import { router } from './routes'
import '@/lib/query-reset'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppQueryProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </AppQueryProvider>
  </StrictMode>,
)
