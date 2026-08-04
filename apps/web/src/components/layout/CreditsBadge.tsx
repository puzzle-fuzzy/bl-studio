import { Coins } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useCreditsStore } from '@/stores/credits-store'
import { formatCentsWithGrouping } from '@/lib/money'

/**
 * 积分余额。
 * - badge：紧凑徽标（账户下拉内使用）；
 * - row：侧栏底部一整行（Coins + 积分 + 余额）。
 * 认证后加载，窗口聚焦时刷新。
 */
export function CreditsBadge({ layout = 'badge' }: { layout?: 'badge' | 'row' }) {
  const balance = useCreditsStore(state => state.balance)
  const hasLoaded = useCreditsStore(state => state.hasLoaded)
  const load = useCreditsStore(state => state.load)
  const refresh = useCreditsStore(state => state.refresh)

  useEffect(() => {
    void load()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, refresh])

  if (!hasLoaded || balance === null) return null

  if (layout === 'row') {
    return (
      <SidebarMenuButton className="h-auto w-full">
        <Coins className="size-4 text-amber-500" />
        <span className="flex-1 text-left">积分</span>
        <span className="text-xs font-medium">{formatCentsWithGrouping(balance.availableCents)}</span>
      </SidebarMenuButton>
    )
  }

  return (
    <Badge variant="secondary" className="gap-1.5 px-2 py-1 font-normal">
      <Coins className="size-3.5 text-amber-500" />
      <span className="text-xs">{formatCentsWithGrouping(balance.availableCents)}</span>
    </Badge>
  )
}
