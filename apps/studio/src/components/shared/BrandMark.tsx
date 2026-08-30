import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 group-data-[collapsible=icon]:justify-center', className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" data-icon />
      </div>
      {!compact && <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Bailian Studio</span>}
    </div>
  )
}
