import { useMemo } from 'react'
import { parseScreenplay, type ScreenplayLine } from '@/lib/screenplay-format'
import { cn } from '@/lib/utils'

export function ScreenplayDocument({ text, className }: { text: string; className?: string }) {
  const lines = useMemo(() => parseScreenplay(text), [text])

  return (
    <article className={cn('mx-auto max-w-3xl px-6 py-8 font-serif text-[15px] leading-8 sm:px-10', className)} aria-label="标准剧本正文">
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground underline decoration-2 underline-offset-4">角色名</span> 角色</span>
        <span className="font-medium text-destructive">对白</span>
        <span className="text-primary">场景标题</span>
        <span className="italic">动作 / 表演提示</span>
      </div>
      <div className="flex flex-col">
        {lines.map((line, index) => <ScreenplayLineView key={`${index}-${line.text}`} line={line} />)}
      </div>
    </article>
  )
}

function ScreenplayLineView({ line }: { line: ScreenplayLine }) {
  if (line.kind === 'blank') return <div className="h-3" aria-hidden="true" />

  if (line.kind === 'title') {
    return <p className="mb-4 text-center font-sans text-xl font-semibold tracking-[0.16em] text-foreground">{line.text}</p>
  }

  if (line.kind === 'scene-heading') {
    return <p className="mt-4 mb-1 font-sans text-sm font-semibold tracking-[0.08em] text-primary">{line.text}</p>
  }

  if (line.kind === 'section-heading') {
    return <p className="mt-4 mb-1 font-sans text-sm font-semibold text-foreground">{line.text}</p>
  }

  if (line.kind === 'dialogue') {
    return (
      <p className={cn('leading-8', line.speaker === undefined ? 'text-destructive' : 'grid grid-cols-[minmax(4.5rem,7rem)_minmax(0,1fr)] gap-x-3')}>
        {line.speaker !== undefined && <span className="font-sans font-medium text-foreground underline decoration-2 underline-offset-4">{line.speaker}</span>}
        <span className="text-destructive">{line.dialogue ?? line.text}</span>
      </p>
    )
  }

  if (line.kind === 'parenthetical') {
    if (line.speaker !== undefined) {
      return (
        <p className="grid grid-cols-[minmax(4.5rem,7rem)_minmax(0,1fr)] gap-x-3 font-sans text-sm leading-7">
          <span className="font-medium text-foreground underline decoration-2 underline-offset-4">{line.speaker}</span>
          <span className="italic text-muted-foreground">{line.dialogue ?? line.text}</span>
        </p>
      )
    }
    return <p className="pl-4 font-sans text-sm italic text-muted-foreground">{line.dialogue ?? line.text}</p>
  }

  if (line.kind === 'list-item') {
    return <p className="pl-4 text-foreground/90">{line.text}</p>
  }

  return <p className="text-foreground/90">{line.text}</p>
}
