import { Badge } from '@/components/ui/badge'
import { generationStatusLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

type BadgeVariant = React.ComponentProps<typeof Badge>['variant']

const STATUS_TONES: Record<string, { variant: BadgeVariant; className?: string }> = {
  succeeded: { variant: 'secondary', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  failed: { variant: 'destructive' },
  cancelled: { variant: 'outline', className: 'text-muted-foreground' },
  processing: { variant: 'outline', className: 'text-sky-700 dark:text-sky-300' },
}

/** 生成状态徽章：已知状态映射语义色，未知状态回退「未知」不伪装。 */
export function StatusBadge({ status, className }: { status: string | undefined; className?: string }) {
  const tone = STATUS_TONES[status ?? ''] ?? { variant: 'outline' as BadgeVariant }
  return (
    <Badge variant={tone.variant} className={cn(tone.className, className)}>
      {generationStatusLabel(status)}
    </Badge>
  )
}
