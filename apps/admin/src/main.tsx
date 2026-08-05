import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './routes'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
