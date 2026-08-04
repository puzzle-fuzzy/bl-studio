import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RedirectIfAuthed } from '@/components/auth/RedirectIfAuthed'
import { CreatePage } from '@/pages/CreatePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { GenerationsPage } from '@/pages/GenerationsPage'
import { LoginPage } from '@/pages/auth/LoginPage'

/**
 * 路由表。
 * - `/create` 等创作路由受保护（ProtectedRoute 渲染 AppShell 外壳）；
 * - 认证路由为访客路由（已登录跳回首页）；
 * - 公开分享页在鉴权门之外，匿名只读。
 *
 * 较重页面（详情/辅助/作品库/分享/认证子页）用 React.lazy 按路由分包，
 * 减小首屏 bundle（build 会提示 chunk 大小，代码分割是预期处理）。
 */

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
    <Suspense
      fallback={
        <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          加载中…
        </div>
      }
    >
      <Component />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/create" replace /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/create', element: <CreatePage /> },
      { path: '/catalog', element: <CatalogPage /> },
      { path: '/generations', element: <GenerationsPage /> },
      { path: '/generations/:id', element: lazyPage('GenerationDetailPage', () => import('@/pages/GenerationDetailPage')) },
      { path: '/functions', element: lazyPage('FunctionsPage', () => import('@/pages/FunctionsPage')) },
      { path: '/library', element: lazyPage('LibraryPage', () => import('@/pages/LibraryPage')) },
    ],
  },
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  { path: '/auth/verify-email', element: lazyPage('VerifyEmailPage', () => import('@/pages/auth/VerifyEmailPage')) },
  { path: '/auth/check-email', element: lazyPage('CheckEmailPage', () => import('@/pages/auth/CheckEmailPage')) },
  { path: '/auth/forgot-password', element: lazyPage('ForgotPasswordPage', () => import('@/pages/auth/ForgotPasswordPage')) },
  { path: '/auth/reset-password', element: lazyPage('ResetPasswordPage', () => import('@/pages/auth/ResetPasswordPage')) },
  { path: '/share/generations/:shareId', element: lazyPage('SharedGenerationPage', () => import('@/pages/SharedGenerationPage')) },
  { path: '*', element: <Navigate to="/create" replace /> },
])
