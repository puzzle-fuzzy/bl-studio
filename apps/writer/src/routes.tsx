import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { ProtectedRoute, RedirectIfAuthed, LoginPage } from '@bailian-studio/app-shell'
import { RouteErrorElement } from '@bailian-studio/lib-client'
import { WriterShell } from './components/layout/WriterShell'

function lazyPage(name: string, loader: () => Promise<Record<string, unknown>>) {
  const Component = lazy(async () => {
    const module = await loader()
    const Candidate = module[name]
    if (typeof Candidate !== 'function') {
      throw new Error(`懒加载页面缺少命名导出：${name}`)
    }
    return { default: Candidate as ComponentType }
  })
  return (
    <Suspense fallback={
      <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        加载中…
      </div>
    }>
      <Component />
    </Suspense>
  )
}

const base = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL

export const router = createBrowserRouter([
  {
    // basename 从 vite base 注入（开发直连与生产 /writer 前缀一致）
    errorElement: <RouteErrorElement />,
    children: [
      { path: '/', element: <Navigate to="/writing" replace /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <WriterShell />,
            children: [
              { path: '/writing', element: lazyPage('WritingPage', () => import('./pages/WritingPage')) },
              { path: '/director', element: lazyPage('DirectorPage', () => import('./pages/DirectorPage')) },
              { path: '/director/:id', element: lazyPage('DirectorProjectPage', () => import('./pages/DirectorProjectPage')) },
            ],
          },
        ],
      },
      {
        element: <RedirectIfAuthed />,
        children: [
          { path: '/login', element: <LoginPage /> },
        ],
      },
    ],
  },
], base === undefined ? {} : { basename: base })
