import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { categoryLabel } from '@/lib/labels'

const CATEGORIES = ['image', 'video', 'audio', 'text'] as const

/** 模型选择器：按分类分组的单一下拉，紧凑不占纵向空间。 */
export function ModelSelector({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
}) {
  const grouped = CATEGORIES.map(category => ({
    category,
    items: models.filter(model => model.category === category),
  })).filter(group => group.items.length > 0)

  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择模型" />
      </SelectTrigger>
      <SelectContent>
        {grouped.map(group => (
          <SelectGroup key={group.category}>
            <SelectLabel>{categoryLabel(group.category)}</SelectLabel>
            {group.items.map(model => (
              <SelectItem key={model.id} value={model.id}>
                {model.displayName} · {model.operation}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
