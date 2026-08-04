import { Loader2 } from 'lucide-react'
import type { GenerationEstimate } from '@bailian-studio/api-client'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * 费用预估摘要（固定区域，永不消失）：本次预估 + 可用积分。
 * 未产生预估时显示占位「—」，避免输入过程反复出现/消失造成跳动。
 */
export function EstimateSummary({
  estimate,
  estimating,
}: {
  estimate: GenerationEstimate | null
  estimating: boolean
}) {
  const cannotAfford = estimate !== null && !estimate.credits.canAfford

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
        cannotAfford ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40',
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {estimating ? <Loader2 className="size-3 animate-spin" /> : null}
        本次预估
      </span>
      <span className="font-medium">
        {estimate !== null ? formatCents(estimate.costEstimate) : estimating ? '计算中…' : '—'}
      </span>
      <span className="text-muted-foreground">
        可用积分{' '}
        <span className={cn('font-medium', cannotAfford && 'text-destructive')}>
          {estimate !== null ? formatCents(estimate.credits.availableCents) : '—'}
        </span>
      </span>
    </div>
  )
}
