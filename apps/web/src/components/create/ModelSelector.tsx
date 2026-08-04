import { useState } from 'react'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { categoryLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

const CATEGORIES = ['all', 'image', 'video', 'audio', 'text'] as const
type Category = (typeof CATEGORIES)[number]

/** 模型选择器：分类 Tab + 模型卡片网格。选中态高亮。 */
export function ModelSelector({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
}) {
  const [category, setCategory] = useState<Category>('all')
  const filtered =
    category === 'all' ? models : models.filter(model => model.category === category)

  return (
    <div className="space-y-3">
      <Tabs value={category} onValueChange={value => setCategory(value as Category)}>
        <TabsList className="flex w-full">
          {CATEGORIES.map(item => (
            <TabsTrigger key={item} value={item} className="flex-1">
              {item === 'all' ? '全部' : categoryLabel(item)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {filtered.map(model => (
          <button
            key={model.id}
            type="button"
            onClick={() => onSelect(model.id)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors',
              selectedId === model.id
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border hover:border-muted-foreground/40',
            )}
            aria-pressed={selectedId === model.id}
          >
            <span className="text-sm font-medium">{model.displayName}</span>
            <span className="text-xs text-muted-foreground">{model.operation}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">该分类暂无可用模型</p>
        )}
      </div>
    </div>
  )
}
