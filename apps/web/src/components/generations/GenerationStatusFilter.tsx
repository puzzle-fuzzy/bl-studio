import type { GenerationListView } from '@bailian-studio/api-client'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const VIEW_OPTIONS: Array<{ value: GenerationListView; label: string }> = [
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'hidden', label: '已隐藏' },
  { value: 'deleted', label: '已删除' },
]

/** 任务列表视图筛选（多选，服务端 OR 语义）。 */
export function GenerationStatusFilter({
  value = [],
  onFiltersChange,
}: {
  value?: readonly GenerationListView[]
  onFiltersChange: (views: GenerationListView[]) => void
}) {
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      value={[...value]}
      onValueChange={views => onFiltersChange(views as GenerationListView[])}
    >
      {VIEW_OPTIONS.map(option => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
