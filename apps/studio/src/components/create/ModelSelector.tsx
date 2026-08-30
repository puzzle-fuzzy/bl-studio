import { useEffect, useState } from 'react'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@bailian-studio/ui'
import {
  CATEGORY_OPTIONS,
  SUB_MODE_LABELS,
  SUB_MODE_ORDER,
  availableSubModes,
  firstEnabledInCategory,
  firstEnabledModel,
  isModelEnabled,
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
 * 分类与子模式默认都由选中模型 `selectedId` 派生（单一事实源），不设本地 state：
 * 若本地另存一份 subMode/category，切换子模式时会出现「本地 subMode 已变、父级 selectedId
 * 未同步」的中间渲染，Radix Select 会在受控 value 不在选项列表时回调 onValueChange('')，
 * 清空选中模型，进而被自动选中 effect 抢回第一个模型（选中即弹回）。
 *
 * 唯一例外是「浏览置灰子模式」：某子模式全部模型暂未开通时，允许 browse 覆盖暂时停留在
 * 该子模式，让用户能看到带「暂未开通」tag 的置灰项。当前各子模式仍有 ≥1 个启用模型
 * （如参考生视频 r2v 由 happyhorse-reference-video 支撑，vidu 参考生视频 6 个已全置灰），
 * 因此 browse 是防御机制；若未来某子模式启用模型归零即触发。
 * browse 只对设置它时的 selectedId 生效（anchoredId 锚定）；selectedId 一旦改变
 * （reuse 还原 / 深链 / 选中其它模型），立即回归派生值，不残留过时浏览态。
 */
export function ModelSelector({
  models,
  selectedId,
  onSelect,
  defaultCategory = 'video',
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
  defaultCategory?: ModelCategory
}) {
  const categories = CATEGORY_OPTIONS.filter(category => models.some(model => model.category === category.value))
  const selected = models.find(model => model.id === selectedId)
  const defaultCategoryValue = categories.some(category => category.value === defaultCategory)
    ? defaultCategory
    : (categories[0]?.value ?? defaultCategory)
  const availableDefaultModes = availableSubModes(models, defaultCategoryValue)

  const category: ModelCategory =
    selected !== undefined
      && (selected.category === 'video' || selected.category === 'image' || selected.category === 'audio')
      ? selected.category
      : defaultCategoryValue
  const derivedSubMode: SubMode =
    selected !== undefined
      ? subModeOf(selected)
      : (availableDefaultModes[0] ?? SUB_MODE_ORDER[category][0] ?? 'r2v')

  // 浏览置灰子模式的覆盖（见上方注释）：仅当 browse.anchoredId === selectedId 时生效。
  const [browse, setBrowse] = useState<{ mode: SubMode; anchoredId: string | undefined } | null>(null)
  const subMode: SubMode =
    browse !== null && browse.anchoredId === selectedId ? browse.mode : derivedSubMode

  // 无有效选中模型时（?select= 空参 / 目录刚加载 / 选中 id 失效 / 选中已暂未开通模型），
  // 自动选中当前级联（分类+子模式）下的第一个已启用模型，跳过全部暂未开通的模型。
  useEffect(() => {
    if (models.length === 0) return
    if (selectedId !== undefined && models.some(model => model.id === selectedId && isModelEnabled(model))) return
    const first = firstEnabledInCategory(models, category, subMode)
    if (first !== undefined) {
      setBrowse(null)
      onSelect(first.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, category, subMode, selectedId, onSelect])

  const modeModels = modelsInMode(models, category, subMode)
  const modeOptions = availableSubModes(models, category)

  const handleCategoryChange = (value: string) => {
    const next = value as ModelCategory
    setBrowse(null)
    const first = firstEnabledInCategory(models, next)
    if (first !== undefined) onSelect(first.id)
  }

  const handleSubModeChange = (value: string) => {
    const next = value as SubMode
    const first = firstEnabledModel(models, category, next)
    if (first !== undefined) {
      setBrowse(null)
      onSelect(first.id)
      return
    }
    // 该子模式全部暂未开通（无已启用模型）：停留在该子模式展示置灰项，不改选中模型。
    // anchoredId 固定为当前 selectedId，一旦父级改选中模型即自动失效回归派生值。
    setBrowse({ mode: next, anchoredId: selectedId })
  }

  const handleModelSelect = (value: string) => {
    // Radix 在选项列表变化导致受控值不在列表时可能回调空串，忽略以免污染选中模型。
    if (value === '') return
    setBrowse(null)
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
            {/* 浏览置灰子模式时 selectedId 可能不属于当前子模式列表，此时显示占位符。 */}
            {selected !== undefined && modeModels.some(model => model.id === selected.id)
              ? <span className="truncate">{modelNameZh(selected)}</span>
              : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {modeModels.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">该子模式暂无可用模型</div>
          ) : (
            modeModels.map(model => {
              const disabled = !isModelEnabled(model)
              const notActivated = model.availability?.notActivated
              return (
                <SelectItem key={model.id} value={model.id} disabled={disabled} className="py-1.5 pr-9">
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
                      <span className="truncate">{modelNameZh(model)}</span>
                      {notActivated !== undefined && (
                        // 置灰项整体 opacity-50，tag 用 text-foreground 保证可读
                        <span className="shrink-0 rounded-sm bg-muted px-1 text-[10px] leading-4 text-foreground">
                          {notActivated}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{model.displayName}</span>
                  </span>
                </SelectItem>
              )
            })
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
