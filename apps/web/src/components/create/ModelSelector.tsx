import { useEffect, useState } from 'react'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CATEGORY_OPTIONS,
  SUB_MODE_LABELS,
  SUB_MODE_ORDER,
  availableSubModes,
  modelsInMode,
  subModeOf,
  type ModelCategory,
  type SubMode,
} from '@/lib/model-modes'

/**
 * 模型级联选择器：分类（视频/图片/音乐）→ 子模式（参考生视频/图生视频/文生视频/视频编辑…）
 * → 模型。子模式由模型 capabilities 推导（见 lib/model-modes）。
 * 默认选中 视频生成 / 第一个子模式 / 第一个模型；外部 selectedId 变化（?reuse= 等）自动同步。
 */
export function ModelSelector({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
}) {
  const categories = CATEGORY_OPTIONS.filter(category => models.some(model => model.category === category.value))
  const selected = models.find(model => model.id === selectedId)

  const [category, setCategory] = useState<ModelCategory>(() =>
    selected !== undefined
      && (selected.category === 'video' || selected.category === 'image' || selected.category === 'audio')
      ? selected.category
      : 'video',
  )
  const [subMode, setSubMode] = useState<SubMode>(() =>
    selected !== undefined ? subModeOf(selected) : SUB_MODE_ORDER.video[0] ?? 'r2v',
  )

  // 外部 selectedId 变化（?select= / ?reuse= / 预设应用）时同步分类与子模式。
  useEffect(() => {
    if (selected === undefined) return
    if (selected.category === 'video' || selected.category === 'image' || selected.category === 'audio') {
      setCategory(selected.category)
    }
    setSubMode(subModeOf(selected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const modeModels = modelsInMode(models, category, subMode)
  const modeOptions = availableSubModes(models, category)

  const handleCategoryChange = (value: string) => {
    const next = value as ModelCategory
    setCategory(next)
    const firstMode = (availableSubModes(models, next)[0] ?? SUB_MODE_ORDER[next][0]) ?? 'r2v'
    setSubMode(firstMode)
    const first = modelsInMode(models, next, firstMode)[0]
    if (first !== undefined) onSelect(first.id)
  }

  const handleSubModeChange = (value: string) => {
    const next = value as SubMode
    setSubMode(next)
    const first = modelsInMode(models, category, next)[0]
    if (first !== undefined) onSelect(first.id)
  }

  const handleModelSelect = (value: string) => {
    const model = models.find(candidate => candidate.id === value)
    if (model !== undefined && (model.category === 'video' || model.category === 'image' || model.category === 'audio')) {
      setCategory(model.category)
      setSubMode(subModeOf(model))
    }
    onSelect(value)
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Select value={category} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categories.map(categoryOption => (
            <SelectItem key={categoryOption.value} value={categoryOption.value}>
              {categoryOption.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={subMode} onValueChange={handleSubModeChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modeOptions.map(mode => (
            <SelectItem key={mode} value={mode}>
              {SUB_MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedId} onValueChange={handleModelSelect}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {modeModels.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">该子模式暂无可用模型</div>
          ) : (
            modeModels.map(model => (
              <SelectItem key={model.id} value={model.id}>
                {model.displayName}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
