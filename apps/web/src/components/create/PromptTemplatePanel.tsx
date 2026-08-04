import { Wand2 } from 'lucide-react'
import { promptTemplatesForCategory } from '@/lib/prompt-templates'
import { cn } from '@/lib/utils'

/** 提示词模板起点：按模型类别提供，点击填入。 */
export function PromptTemplatePanel({
  category,
  onApply,
}: {
  category: string | undefined
  onApply: (prompt: string) => void
}) {
  const templates = promptTemplatesForCategory(category)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Wand2 className="size-3" />
        模板：
      </span>
      {templates.map(template => (
        <button
          key={template.id}
          type="button"
          onClick={() => onApply(template.prompt)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
            'hover:border-primary/50 hover:text-foreground',
          )}
        >
          {template.label}
        </button>
      ))}
    </div>
  )
}
