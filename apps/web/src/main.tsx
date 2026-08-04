import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from 'next-themes'
import { router } from './routes'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
