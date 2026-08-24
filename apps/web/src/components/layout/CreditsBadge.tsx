import { Coins } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useCreditsStore } from '@/stores/credits-store'
import { formatCentsCompact, formatCentsWithGrouping } from '@/lib/money'

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
      <SidebarMenuButton
        aria-label={`积分 ${formatCentsWithGrouping(balance.availableCents)}`}
        className="h-auto w-full group-data-[collapsible=icon]:h-10! group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:gap-1! group-data-[collapsible=icon]:px-1!"
        tooltip={`积分 ${formatCentsWithGrouping(balance.availableCents)}`}
      >
        <Coins className="size-4 text-amber-500" />
        <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">积分</span>
        <span className="text-xs font-medium tabular-nums group-data-[collapsible=icon]:text-[11px]">
          <span className="group-data-[collapsible=icon]:hidden">{formatCentsWithGrouping(balance.availableCents)}</span>
          <span className="hidden group-data-[collapsible=icon]:inline">{formatCentsCompact(balance.availableCents)}</span>
        </span>
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
