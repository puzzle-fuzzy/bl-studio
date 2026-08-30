import { Link, Outlet } from 'react-router'
import { Palette, ArrowLeft } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'

/**
 * 画布外壳：极简顶栏，聚焦画布创作。
 * 与 studio 的 AppShell / writer 的 WriterShell 互不依赖。
 */
export function CanvasShell() {
  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-surface px-4">
          <Link to="/canvas" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Palette className="size-4 text-primary" aria-hidden />
            画布
          </Link>
          <div className="flex-1" />
          <a
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            返回工作区
          </a>
        </header>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
