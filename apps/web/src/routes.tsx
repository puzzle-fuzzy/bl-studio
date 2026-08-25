import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RedirectIfAuthed } from '@/components/auth/RedirectIfAuthed'
import { RouteErrorElement } from '@/components/shared/RouteErrorElement'
import { notifyChunkLoadFailure } from '@/lib/chunk-recovery'
import { CreatePage } from '@/pages/CreatePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { GenerationsPage } from '@/pages/GenerationsPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { WorkbenchPage } from '@/pages/WorkbenchPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { LegalPage } from '@/pages/LegalPage'

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
    let module: Record<string, unknown>
    try {
      module = await loader()
    } catch (error) {
      // 动态 import 失败（部署后旧 chunk 被删）：触发守卫式 reload 自愈。
      notifyChunkLoadFailure(error)
      throw error
    }
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
  {
    // 根布局 errorElement：懒加载 chunk 失败等渲染错误不再白屏，显示刷新恢复 UI。
    // 受保护路由内的渲染错误优先被 AppShell 的 ErrorBoundary 捕获，这里兜底
    // 登录/认证/分享等没有内层边界的路由。
    errorElement: <RouteErrorElement />,
    children: [
      { path: '/', element: <Navigate to="/workbench" replace /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/workbench', element: <WorkbenchPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/:projectId', element: lazyPage('CreativeProjectDetailPage', () => import('@/pages/CreativeProjectDetailPage')) },
          { path: '/assets', element: lazyPage('AssetWorkbenchPage', () => import('@/pages/AssetWorkbenchPage')) },
          { path: '/assets/projects/:projectId', element: lazyPage('CreativeProjectDetailPage', () => import('@/pages/CreativeProjectDetailPage')) },
          { path: '/assets/:id', element: lazyPage('CreativeAssetDetailPage', () => import('@/pages/CreativeAssetDetailPage')) },
          { path: '/create', element: <CreatePage /> },
          { path: '/writing', element: lazyPage('WritingPage', () => import('@/pages/WritingPage')) },
          { path: '/director', element: lazyPage('DirectorPage', () => import('@/pages/DirectorPage')) },
          { path: '/director/:id', element: lazyPage('DirectorProjectPage', () => import('@/pages/DirectorProjectPage')) },
          { path: '/catalog', element: <CatalogPage /> },
          { path: '/generations', element: <GenerationsPage /> },
          { path: '/generations/:id', element: lazyPage('GenerationDetailPage', () => import('@/pages/GenerationDetailPage')) },
          { path: '/functions', element: lazyPage('FunctionsPage', () => import('@/pages/FunctionsPage')) },
          { path: '/library', element: <Navigate to="/assets" replace /> },
          { path: '/gallery', element: lazyPage('GalleryPage', () => import('@/pages/GalleryPage')) },
          { path: '/prompts', element: lazyPage('PromptsPage', () => import('@/pages/PromptsPage')) },
          { path: '/settings', element: lazyPage('ProfilePage', () => import('@/pages/ProfilePage')) },
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
      { path: '/privacy', element: <LegalPage kind="privacy" /> },
      { path: '/terms', element: <LegalPage kind="terms" /> },
      { path: '/auth/verify-email', element: lazyPage('VerifyEmailPage', () => import('@/pages/auth/VerifyEmailPage')) },
      { path: '/auth/check-email', element: lazyPage('CheckEmailPage', () => import('@/pages/auth/CheckEmailPage')) },
      { path: '/auth/forgot-password', element: lazyPage('ForgotPasswordPage', () => import('@/pages/auth/ForgotPasswordPage')) },
      { path: '/auth/reset-password', element: lazyPage('ResetPasswordPage', () => import('@/pages/auth/ResetPasswordPage')) },
      { path: '/share/generations/:shareId', element: lazyPage('SharedGenerationPage', () => import('@/pages/SharedGenerationPage')) },
      { path: '*', element: <Navigate to="/workbench" replace /> },
    ],
  },
])
