import type { ReactNode } from 'react'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

export type PageStateVariant = 'loading' | 'empty' | 'error'

export function PageState({
  variant,
  title,
  description,
  action,
  icon,
  className,
}: {
  variant: PageStateVariant
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  const defaultIcon = variant === 'loading'
    ? <Loader2 className="size-6 animate-spin" aria-hidden="true" />
    : variant === 'error'
      ? <AlertCircle className="size-6" aria-hidden="true" />
      : <Inbox className="size-6" aria-hidden="true" />

  return (
    <section
      role={variant === 'loading' ? 'status' : variant === 'error' ? 'alert' : undefined}
      className={cn(
        'flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-8 text-center',
        className,
      )}
    >
      <div className={cn(
        'flex size-12 items-center justify-center rounded-xl bg-muted/70',
        variant === 'error' ? 'text-destructive' : 'text-primary',
      )}>
        {icon ?? defaultIcon}
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description !== undefined && <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action}
    </section>
  )
}
