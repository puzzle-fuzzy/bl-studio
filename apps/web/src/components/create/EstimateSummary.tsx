import { Loader2 } from 'lucide-react'
import type { GenerationEstimate } from '@bailian-studio/api-client'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/** 费用预估摘要：本次预估 + 积分余额 + 今日用量/限额。 */
export function EstimateSummary({
  estimate,
  estimating,
}: {
  estimate: GenerationEstimate | null
  estimating: boolean
}) {
  if (estimate === null && !estimating) return null

  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">本次预估</span>
        {estimating ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> 计算中…
          </span>
        ) : (
          <span className="font-medium">{formatCents(estimate?.costEstimate)}</span>
        )}
      </div>
      {estimate !== null && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">可用积分</span>
            <span className={cn(!estimate.credits.canAfford && 'font-medium text-destructive')}>
              {formatCents(estimate.credits.availableCents)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">本月累计</span>
            <span>{formatCents(estimate.usage.chargedCents)}</span>
          </div>
          {!estimate.credits.canAfford && (
            <p className="text-xs text-destructive">积分不足，无法发起生成</p>
          )}
        </>
      )}
    </div>
  )
}
