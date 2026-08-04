import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown } from 'lucide-react'
import type { AssetItem, GenerationEstimate, ModelCatalogItem } from '@bailian-studio/api-client'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { ModelSelector } from '@/components/create/ModelSelector'
import { ParameterForm } from '@/components/create/ParameterForm'
import { PromptInput } from '@/components/create/PromptInput'
import { PromptTemplatePanel } from '@/components/create/PromptTemplatePanel'
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
import { referenceFormatOf, restorePromptReferences, extractReferenceIndexes } from '@/lib/reference-format'
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
  const [searchParams] = useSearchParams()
  const models = useModelCatalogStore(state => state.models)
  const loadModels = useModelCatalogStore(state => state.load)
  const showMessage = useNotificationsStore(state => state.showMessage)
  const refreshGenerations = useGenerationsStore(state => state.refresh)

  const [modelId, setModelId] = useState<string | undefined>(() => {
    const selected = searchParams.get('select')
    return selected ?? undefined
  })
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [promptRefs, setPromptRefs] = useState<AssetItem[]>([])
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Map<string, FieldIssue>>(new Map())

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
            setPromptRefs(restored.refs)
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
      setPromptRefs([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId])

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
      const { params, assetRefs } = buildSubmitPayload(model, values, promptRefs)
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
  }, [model, values, promptRefs])

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

  const handleValueChange = (name: string, value: unknown) => {
    setValues(current => ({ ...current, [name]: value }))
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
      const { params, assetRefs } = buildSubmitPayload(model, values, promptRefs)
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
      {/* 左栏：模型下拉 + 表单（无卡片边框） */}
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">选择模型</h2>
          <ModelSelector models={models} selectedId={modelId} onSelect={id => setModelId(id)} />
        </section>

        {model !== undefined && (
          <section className="space-y-5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{model.displayName}</h2>
              <span className="text-xs text-muted-foreground">{model.operation}</span>
            </div>

            <PromptTemplatePanel
              category={model.category}
              onApply={prompt => handleValueChange('prompt', prompt)}
            />

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
                refs={promptRefs}
                onChange={text => handleValueChange('prompt', text)}
                onRefsChange={setPromptRefs}
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
            </div>
          </section>
        )}
      </div>

      {/* 右栏：最近任务（与左栏以竖分割线隔开） */}
      <div className="xl:border-l xl:border-border xl:pl-8">
        <GenerationsPanel variant="embedded" />
      </div>
    </form>
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
): Promise<{ values: Record<string, unknown>; refs: AssetItem[] }> {
  const format = referenceFormatOf(model)
  const rawPrompt = typeof inputParams?.prompt === 'string' ? inputParams.prompt : ''
  const restoredPrompt = restorePromptReferences(rawPrompt, format)
  const refIndexes = extractReferenceIndexes(restoredPrompt)

  const refsMap = (assetRefs ?? {}) as Record<string, unknown>
  const referenceIds = Array.isArray(refsMap.references)
    ? refsMap.references.filter((id): id is string => typeof id === 'string')
    : []

  const refs: AssetItem[] = []
  for (const index of refIndexes) {
    const assetId = referenceIds[index - 1]
    if (assetId === undefined) continue
    const asset = await apiClient.getAsset(assetId).catch(() => null)
    if (asset !== null) refs.push(asset)
  }

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
  return { values, refs }
}
