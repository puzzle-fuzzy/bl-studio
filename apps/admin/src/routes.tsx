import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AdminShell } from '@/components/AdminShell'
import { ProtectedAdminRoute } from '@/components/ProtectedAdminRoute'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'
import { RouteErrorElement } from '@/components/shared/RouteErrorElement'
import { notifyChunkLoadFailure } from '@/lib/chunk-recovery'
import { LoginPage } from '@/pages/LoginPage'
import { UserListPage } from '@/pages/UserListPage'
import { UserDetailPage } from '@/pages/UserDetailPage'

/** 懒加载包装：动态 import 失败（部署后旧 chunk 被删）时触发守卫式 reload 自愈。 */
function adminLazy<T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T) {
  return lazy(async () => {
    try {
      const module = await loader()
      return { default: module[key] as ComponentType }
    } catch (error) {
      notifyChunkLoadFailure(error)
      throw error
    }
  })
}

// 含 recharts 的页面懒加载以拆分主包。
const StatsPage = adminLazy(() => import('@/pages/StatsPage'), 'StatsPage')
const AnalyticsPage = adminLazy(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage')
const FeedbackPage = adminLazy(() => import('@/pages/FeedbackPage'), 'FeedbackPage')
const ReportsPage = adminLazy(() => import('@/pages/ReportsPage'), 'ReportsPage')
const GalleryManagePage = adminLazy(() => import('@/pages/GalleryManagePage'), 'GalleryManagePage')
const TasksPage = adminLazy(() => import('@/pages/TasksPage'), 'TasksPage')

/**
 * 管理后台路由（basename /admin）。
 *
 * - /admin/login 访客路由：已登录管理员访问时跳回 /admin/users；
 * - 其余路径包在 ProtectedAdminRoute 内：未登录 → /admin/login，
 *   非 admin 角色 → 同样视为未授权；admin 角色才渲染 AdminShell。
 */
export const router = createBrowserRouter(
  [
    {
      // 根布局 errorElement：懒加载 chunk 失败等渲染错误不再白屏，显示刷新恢复 UI。
      errorElement: <RouteErrorElement />,
      children: [
        {
          path: '/login',
          element: (
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          ),
        },
        {
          element: <ProtectedAdminRoute />,
          children: [
            {
              element: <AdminShell />,
              children: [
                { index: true, element: <Navigate to="/users" replace /> },
                { path: 'users', element: <UserListPage /> },
                { path: 'users/:userId', element: <UserDetailPage /> },
                {
                  path: 'stats',
                  element: (
                    <Suspense fallback={null}>
                      <StatsPage />
                    </Suspense>
                  ),
                },
                {
                  path: 'analytics',
                  element: (
                    <Suspense fallback={null}>
                      <AnalyticsPage />
                    </Suspense>
                  ),
                },
                {
                  path: 'feedback',
                  element: (
                    <Suspense fallback={null}>
                      <FeedbackPage />
                    </Suspense>
                  ),
                },
                {
                  path: 'reports',
                  element: (
                    <Suspense fallback={null}>
                      <ReportsPage />
                    </Suspense>
                  ),
                },
                {
                  path: 'gallery',
                  element: (
                    <Suspense fallback={null}>
                      <GalleryManagePage />
                    </Suspense>
                  ),
                },
                {
                  path: 'tasks',
                  element: (
                    <Suspense fallback={null}>
                      <TasksPage />
                    </Suspense>
                  ),
                },
              ],
            },
          ],
        },
        { path: '*', element: <Navigate to="/users" replace /> },
      ],
    },
  ],
  { basename: '/admin' },
)
