import { Coins } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { useCreditsStore } from '@/stores/credits-store'
import { formatCentsWithGrouping } from '@/lib/money'

/** 侧栏/账户菜单的积分余额徽标。认证后加载，窗口聚焦时刷新。 */
export function CreditsBadge() {
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

  return (
    <Badge variant="secondary" className="gap-1.5 px-2 py-1 font-normal">
      <Coins className="size-3.5 text-amber-500" />
      <span className="text-xs">{formatCentsWithGrouping(balance.availableCents)}</span>
    </Badge>
  )
}
