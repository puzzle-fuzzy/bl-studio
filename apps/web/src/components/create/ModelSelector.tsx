import { useEffect } from 'react'
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
  modelNameZh,
  modelsInMode,
  subModeOf,
  type ModelCategory,
  type SubMode,
} from '@/lib/model-modes'

/**
 * 模型级联选择器：分类（视频/图片/音乐）→ 子模式（参考生视频/图生视频/文生视频/视频编辑…）
 * → 模型。子模式由模型 capabilities 推导（见 lib/model-modes）。
 *
 * 分类与子模式都由选中模型 `selectedId` 派生（单一事实源），不设本地 state：
 * 若本地另存一份 subMode/category，切换子模式时会出现「本地 subMode 已变、父级 selectedId
 * 未同步」的中间渲染，Radix Select 会在受控 value 不在选项列表时回调 onValueChange('')，
 * 清空选中模型，进而被自动选中 effect 抢回第一个模型（选中即弹回）。
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

  const category: ModelCategory =
    selected !== undefined
      && (selected.category === 'video' || selected.category === 'image' || selected.category === 'audio')
      ? selected.category
      : 'video'
  const subMode: SubMode = selected !== undefined ? subModeOf(selected) : (SUB_MODE_ORDER.video[0] ?? 'r2v')

  // 无有效选中模型时（?select= 空参 / 目录刚加载 / 选中 id 失效），
  // 自动选中当前级联（分类+子模式）下的第一个模型，保证三连下拉始终有选中项。
  useEffect(() => {
    if (models.length === 0) return
    if (selectedId !== undefined && models.some(model => model.id === selectedId)) return
    const firstMode = availableSubModes(models, category)[0] ?? subMode
    const first = modelsInMode(models, category, firstMode)[0]
    if (first !== undefined) onSelect(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, category, subMode, selectedId, onSelect])

  const modeModels = modelsInMode(models, category, subMode)
  const modeOptions = availableSubModes(models, category)

  const handleCategoryChange = (value: string) => {
    const next = value as ModelCategory
    const firstMode = (availableSubModes(models, next)[0] ?? SUB_MODE_ORDER[next][0]) ?? 'r2v'
    const first = modelsInMode(models, next, firstMode)[0]
    if (first !== undefined) onSelect(first.id)
  }

  const handleSubModeChange = (value: string) => {
    const next = value as SubMode
    const first = modelsInMode(models, category, next)[0]
    if (first !== undefined) onSelect(first.id)
  }

  const handleModelSelect = (value: string) => {
    // Radix 在选项列表变化导致受控值不在列表时可能回调空串，忽略以免污染选中模型。
    if (value === '') return
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
          <SelectValue placeholder="选择模型">
            {selected !== undefined ? <span className="truncate">{modelNameZh(selected)}</span> : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {modeModels.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">该子模式暂无可用模型</div>
          ) : (
            modeModels.map(model => (
              <SelectItem key={model.id} value={model.id} className="py-1.5 pr-9">
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm">{modelNameZh(model)}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{model.displayName}</span>
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
