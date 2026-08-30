import { createBrowserRouter, Navigate } from 'react-router'
import { LoginPage, ProtectedRoute, RedirectIfAuthed } from '@bailian-studio/app-shell'
import { RouteErrorElement } from '@bailian-studio/lib-client'
import { CanvasShell } from './components/canvas/CanvasShell'
import { CanvasPage } from './pages/CanvasPage'

const base = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorElement />,
    children: [
      { path: '/', element: <Navigate to="/canvas" replace /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <CanvasShell />,
            children: [
              { path: '/canvas', element: <CanvasPage /> },
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
