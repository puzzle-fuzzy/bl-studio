import { Link, Outlet, useLocation } from 'react-router'
import { PenLine, Film } from 'lucide-react'
import { cn } from '@bailian-studio/lib-client'

/**
 * 编剧台外壳：聚焦创作的极简顶栏（写作 / 导演台两个入口 + 返回主站）。
 * 与 studio 的 AppShell 互不依赖——守卫只保证登录，壳由各 app 组合。
 */
export function WriterShell() {
  const location = useLocation()
  const nav = [
    { to: '/writing', label: '写作', icon: PenLine },
    { to: '/director', label: '导演台', icon: Film },
  ]
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1660px] items-center gap-1 px-4">
          <Link to="/writing" className="mr-4 text-sm font-semibold tracking-tight">编剧台</Link>
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                location.pathname.startsWith(to) && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
          <div className="flex-1" />
          <a href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">返回创作工作区</a>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
