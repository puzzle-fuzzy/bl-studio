import { createBrowserRouter, Navigate } from 'react-router'
import { AdminShell } from '@/components/AdminShell'
import { ProtectedAdminRoute } from '@/components/ProtectedAdminRoute'
import { RedirectIfAuthed } from '@/components/RedirectIfAuthed'
import { LoginPage } from '@/pages/LoginPage'
import { UserListPage } from '@/pages/UserListPage'
import { UserDetailPage } from '@/pages/UserDetailPage'

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
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/users" replace /> },
  ],
  { basename: '/admin' },
)
