import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, Info, Loader2, X } from 'lucide-react'
import type { AssetItem, GenerationEstimate, ModelCatalogItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelSelector } from '@/components/create/ModelSelector'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ParameterForm } from '@/components/create/ParameterForm'
import { PromptInput } from '@/components/create/PromptInput'
import { CreationPresetPanel } from '@/components/create/CreationPresetPanel'
import { EstimateSummary } from '@/components/create/EstimateSummary'
import { GenerationsPanel } from '@/components/generations/GenerationsPanel'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { useGenerationsStore } from '@/stores/generations-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { buildParameterFormSchema, visibleFormFields, type FormField } from '@/lib/parameter-form-schema'
import { readParameterValidationErrors, type FieldIssue } from '@/lib/parameter-validation'
import { buildSubmitPayload } from '@/lib/generation-submit'
import { idempotencyKeyFor, clearIdempotencyKey } from '@/lib/idempotency'
import { rememberRecentModelId } from '@/lib/creation-presets'
import { modelNameZh } from '@/lib/model-modes'
import { referenceFormatOf, restorePromptReferences } from '@/lib/reference-format'
import { decodeDeepLinkParams } from '@/lib/deeplink-params'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'

const ESTIMATE_DEBOUNCE_MS = 350

/** 不常用的输出参数，收进「高级设置」折叠，默认隐藏。 */
const ADVANCED_PARAM_NAMES = ['watermark', 'seed']

/**
 * 创作工作台：模型下拉 → 参考素材 → 提示词(@图N) → 动态参数 → 固定预估区 → 提交（幂等）。
 * 左右两栏 1:1，中间竖分割线；表单内容不套卡片边框。
 */
export function CreatePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const showMessage = useNotificationsStore(state => state.showMessage)
  const refreshGenerations = useGenerationsStore(state => state.refresh)

  const [modelId, setModelId] = useState<string | undefined>(() => {
    // `?select=` 空参与无参等同：都视为未选中，由 ModelSelector 级联默认选中第一个模型。
    return searchParams.get('select') || undefined
  })
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Map<string, FieldIssue>>(new Map())

  // 对比生成：同提示词多模型各提交一条（同一 batchId 分组）。
  const [compareModels, setCompareModels] = useState<ModelCatalogItem[]>([])
  const [compareBusy, setCompareBusy] = useState(false)

  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estimateEpoch = useRef(0)

  const model = selectModelById(models, modelId ?? '')

  // 加载模型目录；默认模型由 ModelSelector 级联下拉负责（视频/首子模式/首模型）。
  useEffect(() => {
    void loadModels()
  }, [loadModels])

  // `?reuse=<id>` 深链：从历史生成记录还原模型与全部参数（含参考图）。
  const reuseId = searchParams.get('reuse')
  useEffect(() => {
    if (reuseId === null) return
    let cancelled = false
    setIsRestoring(true)
    apiClient
      .getGeneration(reuseId)
      .then(record => {
        if (cancelled) return
        if (modelId !== record.modelId) {
          setModelId(record.modelId)
          return
        }
        if (model === undefined) return
        void restoreRecordParams(record.inputParams, record.assetRefs, model).then(restored => {
          if (!cancelled) {
            setValues(restored.values)
          }
        })
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [reuseId, modelId, model])

  // 切换模型：重建默认值、清空预估与错误
  useEffect(() => {
    setFieldErrors(new Map())
    setSubmitError(null)
    setEstimate(null)
    if (model !== undefined) {
      const defaults: Record<string, unknown> = {}
      for (const parameter of model.parameters) {
        if (parameter.defaultValue !== undefined) defaults[parameter.name] = parameter.defaultValue
      }
      setValues(defaults)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId])

  // `?params=<base64url JSON>` 深链：画廊/提示词库复用 —— 按 manifest 校验后把
  // 纯文本参数预载进表单（媒体值已在编码侧剔除，这里再兜底过滤）。
  const deepLinkParamsToken = searchParams.get('params')
  useEffect(() => {
    if (model === undefined || deepLinkParamsToken === null) return
    const restored = decodeDeepLinkParams(model, deepLinkParamsToken)
    if (Object.keys(restored).length > 0) {
      setValues(current => ({ ...current, ...restored }))
    }
  }, [model, deepLinkParamsToken])

  // `?edit=<assetId>`（图生图编辑） / `?ref=<assetId>`（参考图生成变体）：
  // 拉取该资产并预载到选中模型的第一个图片媒体参数。
  const editAssetId = searchParams.get('edit')
  const refAssetId = searchParams.get('ref')
  useEffect(() => {
    if (model === undefined) return
    const assetId = editAssetId ?? refAssetId
    if (assetId === null) return
    let cancelled = false
    apiClient
      .getAsset(assetId)
      .then(asset => {
        if (cancelled) return
        const mediaParameter = model.parameters.find(
          parameter => parameter.type === 'media' && parameter.mediaKind === 'image',
        )
        if (mediaParameter === undefined) return
        setValues(current => {
          const existing: AssetItem[] = Array.isArray(current[mediaParameter.name])
            ? (current[mediaParameter.name] as AssetItem[])
            : []
          if (existing.some(item => item.id === asset.id)) return current
          return { ...current, [mediaParameter.name]: [...existing, asset] }
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [model, editAssetId, refAssetId])

  // 参数变化 → 防抖费用预估。必填项缺失（如图生图缺输入图像）时跳过请求，避免无效报错。
  useEffect(() => {
    if (model === undefined) return
    if (estimateTimer.current !== null) clearTimeout(estimateTimer.current)
    const epoch = ++estimateEpoch.current
    if (missingRequiredFields(visibleFormFields(schema, values), values).length > 0) {
      setEstimating(false)
      setEstimate(null)
      return
    }
    setEstimating(true)
    estimateTimer.current = setTimeout(() => {
      const { params, assetRefs } = buildSubmitPayload(model, values)
      apiClient
        .estimateGeneration({ modelId: model.id, params, assetRefs })
        .then(result => {
          if (epoch === estimateEpoch.current) setEstimate(result)
        })
        .catch(() => {
          if (epoch === estimateEpoch.current) setEstimate(null)
        })
        .finally(() => {
          if (epoch === estimateEpoch.current) setEstimating(false)
        })
    }, ESTIMATE_DEBOUNCE_MS)
    return () => {
      if (estimateTimer.current !== null) clearTimeout(estimateTimer.current)
    }
  }, [model, values])

  const schema = useMemo(
    () => (model === undefined ? [] : buildParameterFormSchema(model.parameters)),
    [model],
  )

  const inputFields = visibleFormFields(schema.filter(field => field.group === 'input'), values).filter(
    field => field.parameter.name !== 'prompt',
  )
  const settingsFields = visibleFormFields(schema.filter(field => field.group === 'settings'), values)
  // 常规输出参数 vs 高级参数（水印/随机种子默认折叠）。
  const basicSettingsFields = settingsFields.filter(field => !ADVANCED_PARAM_NAMES.includes(field.parameter.name))
  const advancedSettingsFields = settingsFields.filter(field => ADVANCED_PARAM_NAMES.includes(field.parameter.name))

  // 参考素材（media 参数，含参考图）放在提示词上方；其余输入参数在提示词下方。
  const mediaFields = inputFields.filter(field => field.control === 'media')
  const textInputFields = inputFields.filter(field => field.control !== 'media')

  // 提示词 @ 引用的参考池：以 `references` 媒体字段（参考素材）为唯一事实源。
  const referencePool = Array.isArray(values.references) ? values.references : []

  const handleValueChange = (name: string, value: unknown) => {
    setValues(current => ({ ...current, [name]: value }))
    // 字段值一旦变化，立即清除该字段的旧校验错误（如选完参考图后「为必填」红字应消失）。
    setFieldErrors(current => {
      if (current.size === 0 || !current.has(name)) return current
      const next = new Map(current)
      next.delete(name)
      return next
    })
    setSubmitError(null)
  }

  // 选中模型：更新状态 + 写入 ?select=，刷新/分享后选中模型不丢失。
  const handleModelSelect = (nextId: string) => {
    setModelId(nextId)
    const next = new URLSearchParams(searchParams)
    next.set('select', nextId)
    setSearchParams(next, { replace: true })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (model === undefined || isSubmitting) return
    setSubmitError(null)
    // 客户端必填校验：缺失时字段级红字提示，不发请求（避免通用「输入内容不合法」）。
    const missing = missingRequiredFields(visibleFormFields(schema, values), values)
    if (missing.length > 0) {
      setFieldErrors(new Map(missing.map(field => [field.parameter.name, {
        field: field.parameter.name,
        code: 'REQUIRED',
        message: `${field.parameter.label}为必填`,
      }])))
      setSubmitError('请先补全必填项')
      return
    }
    setIsSubmitting(true)
    try {
      const { params, assetRefs } = buildSubmitPayload(model, values)
      const payload = { modelId: model.id, params, assetRefs }
      const idempotencyKey = idempotencyKeyFor(payload)
      await apiClient.createGeneration({ ...payload, idempotencyKey })
      clearIdempotencyKey(payload)
      rememberRecentModelId(model.id)
      void refreshGenerations()
      showMessage({ title: '已提交生成任务', tone: 'success' })
      // 保留参数，便于连续创作；只清空预估
      setEstimate(null)
    } catch (error) {
      setSubmitError(userErrorMessage(error))
      setFieldErrors(readParameterValidationErrors(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  /** 对比生成：用当前表单的提示词/文本参数，对选中的每个模型各提交一条（同 batchId）。 */
  const handleCompareSubmit = async () => {
    if (compareModels.length === 0 || compareBusy) return
    setCompareBusy(true)
    const batchId = crypto.randomUUID()
    let submitted = 0
    for (const compareModel of compareModels) {
      const { params, assetRefs } = buildSubmitPayload(compareModel, values)
      const payload = { modelId: compareModel.id, params, assetRefs }
      const idempotencyKey = idempotencyKeyFor(payload)
      try {
        await apiClient.createGeneration({ ...payload, idempotencyKey, batchId })
        clearIdempotencyKey(payload)
        submitted += 1
      } catch (error) {
        showMessage({ title: `${modelNameZh(compareModel)}：${userErrorMessage(error)}`, tone: 'warning' })
      }
    }
    if (submitted > 0) {
      void refreshGenerations()
      showMessage({ title: `已提交 ${submitted} 个对比任务`, tone: 'success' })
    }
    setCompareBusy(false)
  }

  if (models.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto grid max-w-7xl gap-8 xl:grid-cols-2">
      {/* 左栏：模型下拉 + 表单（无卡片边框）。xl 下两栏各自独立滚动，表单很长时不连带滚走最近任务。
          relative 让内部 Select 的原生 <select> 以本列为定位上下文，随列裁剪，避免漏出撑高文档。 */}
      <div className="space-y-6 xl:relative xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto xl:pr-1 xl:pb-8">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">选择模型</h2>
          <ModelSelector models={models} selectedId={modelId} onSelect={handleModelSelect} />
        </section>

        {model !== undefined && (
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{modelNameZh(model)}</h2>
              <span className="truncate text-xs text-muted-foreground">{model.displayName}</span>
              {model.description !== undefined && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="查看模型说明"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64">
                    <p className="text-xs leading-relaxed">{model.description}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {mediaFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">输入参考素材</p>
                <ParameterForm
                  fields={mediaFields}
                  values={values}
                  onChange={handleValueChange}
                  errors={fieldErrors}
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">提示词</p>
              <PromptInput
                value={typeof values.prompt === 'string' ? values.prompt : ''}
                refs={referencePool}
                onChange={text => handleValueChange('prompt', text)}
                supportsReferences={model.referenceFormat !== undefined}
              />
            </div>

            {textInputFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">输入参数</p>
                <ParameterForm
                  fields={textInputFields}
                  values={values}
                  onChange={handleValueChange}
                  errors={fieldErrors}
                />
              </div>
            )}

            {basicSettingsFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">输出参数</p>
                <ParameterForm
                  fields={basicSettingsFields}
                  values={values}
                  onChange={handleValueChange}
                  errors={fieldErrors}
                  layout="grid"
                />
              </div>
            )}

            {advancedSettingsFields.length > 0 && (
              <Collapsible className="group space-y-2">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    高级设置
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ParameterForm
                    fields={advancedSettingsFields}
                    values={values}
                    onChange={handleValueChange}
                    errors={fieldErrors}
                    layout="grid"
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="space-y-2 pt-1">
              <EstimateSummary estimate={estimate} estimating={estimating} />
              {submitError !== null && <p className="text-sm text-destructive">{submitError}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || isRestoring || model === undefined}>
                {isSubmitting ? '提交中…' : isRestoring ? '正在还原参数…' : '开始生成'}
              </Button>
              <CreationPresetPanel
                modelId={model.id}
                params={values}
                disabled={isSubmitting}
                onApply={preset => {
                  setModelId(preset.modelId)
                  setValues(preset.params)
                }}
              />

              {/* 对比生成：同提示词多模型并行提交（同一 batchId）。 */}
              <Collapsible className="group space-y-2 rounded-lg border border-dashed p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    对比生成（同提示词多模型）
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    用当前提示词/文本参数对多个模型各提交一条对比任务。参考图/媒体参数不跨模型复用；请选择同一类模型以获得可比结果。
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {compareModels.map(candidate => (
                      <span key={candidate.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                        {modelNameZh(candidate)}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setCompareModels(current => current.filter(item => item.id !== candidate.id))}
                          aria-label={`移除 ${candidate.id}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    {compareModels.length < 4 && (
                      <ModelCompareAdd models={models} compareIds={compareModels.map(item => item.id)} onAdd={model => setCompareModels(current => [...current, model])} />
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={compareModels.length === 0 || compareBusy}
                    onClick={() => void handleCompareSubmit()}
                  >
                    {compareBusy ? <Loader2 className="size-4 animate-spin" /> : `开始对比（${compareModels.length} 个模型）`}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </section>
        )}
      </div>

      {/* 右栏：最近任务（与左栏以竖分割线隔开）。xl 下固定高度、独立滚动。 */}
      <div className="xl:relative xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto xl:border-l xl:border-border xl:pl-8 xl:pb-8">
        <GenerationsPanel variant="embedded" />
      </div>
    </form>
  )
}

/** 对比生成：从模型目录挑选一个尚未加入对比列表的模型。 */
function ModelCompareAdd({
  models,
  compareIds,
  onAdd,
}: {
  models: readonly ModelCatalogItem[]
  compareIds: readonly string[]
  onAdd: (model: ModelCatalogItem) => void
}) {
  const available = models.filter(model => !compareIds.includes(model.id))
  if (available.length === 0) return null
  return (
    <Select value="" onValueChange={modelId => {
      const selected = available.find(model => model.id === modelId)
      if (selected !== undefined) onAdd(selected)
    }}>
      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="+ 添加模型" /></SelectTrigger>
      <SelectContent>
        {available.map(model => (
          <SelectItem key={model.id} value={model.id}>{modelNameZh(model)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * 客户端必填校验：找出缺失值的必填字段（图生图缺「输入图像」、文生图缺提示词等）。
 * media 字段要求非空数组；其余要求非 undefined/null/空串/NaN。
 */
function missingRequiredFields(fields: readonly FormField[], values: Record<string, unknown>): FormField[] {
  return fields.filter(field => {
    if (field.parameter.required !== true) return false
    const value = values[field.parameter.name]
    if (field.control === 'media') return !Array.isArray(value) || value.length === 0
    return value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value))
  })
}

/**
 * 从历史生成记录还原表单参数（`?reuse=` / 「用同参数新建」）。
 * - 提示词内的 provider 引用语法还原为 `@图N` 编辑标记；
 * - `references` 与各媒体参数的 assetRefs 拉取为 AssetItem[]；
 * - 未引用到的参数保留 manifest 默认值。
 */
async function restoreRecordParams(
  inputParams: Record<string, unknown> | undefined,
  assetRefs: Record<string, unknown> | undefined,
  model: ModelCatalogItem,
): Promise<{ values: Record<string, unknown> }> {
  const format = referenceFormatOf(model)
  const rawPrompt = typeof inputParams?.prompt === 'string' ? inputParams.prompt : ''
  const restoredPrompt = restorePromptReferences(rawPrompt, format)

  const refsMap = (assetRefs ?? {}) as Record<string, unknown>
  const values: Record<string, unknown> = { ...(inputParams ?? {}), prompt: restoredPrompt }
  for (const parameter of model.parameters) {
    if (parameter.type !== 'media') continue
    const ids = refsMap[parameter.name]
    if (!Array.isArray(ids)) continue
    const assets = (
      await Promise.all(
        ids.map(id => (typeof id === 'string' ? apiClient.getAsset(id).catch(() => null) : Promise.resolve(null))),
      )
    ).filter((asset): asset is AssetItem => asset !== null)
    if (assets.length > 0) values[parameter.name] = assets
  }
  return { values }
}
