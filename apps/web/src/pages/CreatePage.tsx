import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowUp, ChevronDown, Image as ImageIcon, ImagePlus, Info, Loader2, Plus, Sparkles, X } from 'lucide-react'
import type { AssetItem, CreativeAssetDetail, GenerationEstimate, GenerationRecord, ModelCatalogItem } from '@bailian-studio/api-client'
import { validateModelParams } from '@bailian-studio/model-core'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelSelector } from '@/components/create/ModelSelector'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ParameterForm } from '@/components/create/ParameterForm'
import { PromptInput } from '@/components/create/PromptInput'
import { CreativeAssetPickerDialog } from '@/components/assets/CreativeAssetPickerDialog'
import { AssetThumbnail } from '@/components/assets/AssetThumbnail'
import { CreationPresetPanel } from '@/components/create/CreationPresetPanel'
import { VirtualScrollArea } from '@/components/ui/virtual-scroll-area'
import { EstimateSummary } from '@/components/create/EstimateSummary'
import { GenerationsPanel } from '@/components/generations/GenerationsPanel'
import { StatusBadge } from '@/components/generations/StatusBadge'
import { useModelCatalogStore, selectModelById } from '@/stores/model-catalog-store'
import { useGenerationsStore } from '@/stores/generations-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { buildParameterFormSchema, visibleFormFields, type FormField } from '@/lib/parameter-form-schema'
import {
  parameterIssuesToFieldErrors,
  readParameterValidationErrors,
  type FieldIssue,
} from '@/lib/parameter-validation'
import { buildSubmitPayload, buildValidationParams } from '@/lib/generation-submit'
import { idempotencyKeyFor, clearIdempotencyKey } from '@/lib/idempotency'
import { rememberRecentModelId } from '@/lib/creation-presets'
import { firstEnabledModel, isModelEnabled, modelNameZh, SUB_MODE_LABELS, subModeOf, type SubMode } from '@/lib/model-modes'
import { formatCents } from '@/lib/money'
import { referenceFormatOf, restorePromptReferences } from '@/lib/reference-format'
import { decodeDeepLinkParams } from '@/lib/deeplink-params'
import { apiClient, resolveApiUrl } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'
import { notifyError } from '@/lib/toast'
import { buildCreativeGenerationContext, creativeAssetReferencesToAssetItems } from '@/lib/creative-generation'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/components/generations/GenerationListItem'

const ESTIMATE_DEBOUNCE_MS = 350

/** 不常用的输出参数，收进「高级设置」折叠，默认隐藏。 */
const ADVANCED_PARAM_NAMES = ['watermark', 'seed']
const CHARACTER_HIDDEN_PARAM_NAMES = new Set(['negativePrompt', 'promptExtend', 'watermark', 'seed'])

const CREATION_INTENTS = {
  asset: {
    eyebrow: '普通资产',
    title: '创建资产',
    description: '生成可以继续整理、复用或收录的图片和视频资产。',
    imageOnly: false,
    promptGuide: null,
  },
  character: {
    eyebrow: '图片资产 / 人物',
    title: '创建人物',
    description: '通过提示词和参考图片生成可复用的人物设定图，重点产出正面、左侧、右侧、背面四视图。',
    imageOnly: true,
    promptGuide: {
      title: '人物四视图提示词',
      description: '建议要求同一张设定板展示正面、左侧、右侧、背面，保持人物外观、服装、比例和光线一致。',
      template: '角色设定图，同一人物的正面、左侧、右侧、背面四视图，完整身体，保持脸部特征、发型、服装、配色和比例一致，白色背景，平视，均匀光线，无文字，无水印。',
    },
  },
  environment: {
    eyebrow: '图片资产 / 场地',
    title: '创建场地',
    description: '通过文生图、图生图或参考生图生成可复用的场地背景。',
    imageOnly: true,
    promptGuide: {
      title: '场地背景提示词',
      description: '建议写清空间类型、时间、天气、材质、景别和镜头方向，避免把人物或道具当作主体。',
      template: '场地背景设定图，完整展示空间结构和环境氛围，明确时间、天气、材质、光线和镜头方向，画面干净，无人物，无文字，无水印。',
    },
  },
  prop: {
    eyebrow: '图片资产 / 道具',
    title: '创建道具',
    description: '通过文生图、图生图或参考生图生成可复用的道具图片。',
    imageOnly: true,
    promptGuide: {
      title: '道具图片提示词',
      description: '建议写清道具的材质、结构、颜色、角度和使用状态，并让主体与背景保持简洁。',
      template: '道具设定图，完整展示道具的结构、材质、颜色和关键细节，主体居中，干净背景，清晰光线，无人物，无文字，无水印。',
    },
  },
} as const

type CreationIntentType = keyof typeof CREATION_INTENTS

function isCreationIntentType(value: string | null): value is CreationIntentType {
  return value !== null && value in CREATION_INTENTS
}

/**
 * 创作工作台：模型下拉 → 参考素材 → 提示词(@图N) → 动态参数 → 固定预估区 → 提交（幂等）。
 * 左右两栏 1:1，中间竖分割线；表单内容不套卡片边框。
 */
export function CreatePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const creationType: CreationIntentType = isCreationIntentType(searchParams.get('assetType'))
    ? searchParams.get('assetType') as CreationIntentType
    : 'asset'
  const creationIntent = CREATION_INTENTS[creationType]
  const models = useModelCatalogStore(state => state.models)
  const availableModels = useMemo(
    () => creationIntent.imageOnly ? models.filter(item => item.category === 'image') : models,
    [creationIntent.imageOnly, models],
  )
  const loadModels = useModelCatalogStore(state => state.load)
  const showMessage = useNotificationsStore(state => state.showMessage)
  const refreshGenerations = useGenerationsStore(state => state.refresh)
  const generationRecords = useGenerationsStore(state => state.records)

  const [modelId, setModelId] = useState<string | undefined>(() => {
    // `?select=` 空参与无参等同：都视为未选中，由 ModelSelector 级联默认选中第一个模型。
    return searchParams.get('select') || undefined
  })
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Map<string, FieldIssue>>(new Map())

  // 对比生成：同提示词多模型各提交一条（同一 batchId 分组）。
  const [compareModels, setCompareModels] = useState<ModelCatalogItem[]>([])
  const [compareBusy, setCompareBusy] = useState(false)
  const [creativeAssets, setCreativeAssets] = useState<CreativeAssetDetail[]>([])
  const [creativePickerOpen, setCreativePickerOpen] = useState(false)
  const [characterSessionRecords, setCharacterSessionRecords] = useState<GenerationRecord[]>([])
  const [selectedCharacterRecordId, setSelectedCharacterRecordId] = useState<string>()

  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estimateEpoch = useRef(0)
  const previousCreationType = useRef(creationType)

  const model = selectModelById(availableModels, modelId ?? '')
  const creativeAssetId = searchParams.get('creativeAssetId')
  const projectId = searchParams.get('projectId') ?? undefined
  const creativeContext = useMemo(
    () => (model === undefined
      ? undefined
      : buildCreativeGenerationContext({
          model,
          prompt: typeof values.prompt === 'string' ? values.prompt : '',
          negativePrompt: typeof values.negativePrompt === 'string' ? values.negativePrompt : undefined,
          projectId,
          assets: creativeAssets,
        })),
    [creativeAssets, model, projectId, values.negativePrompt, values.prompt],
  )

  // 加载模型目录；默认模型由 ModelSelector 级联下拉负责（视频/首子模式/首模型）。
  useEffect(() => {
    void loadModels()
  }, [loadModels])

  // 三种结构化创作是独立工作流：从侧栏切换时不继承上一种工作流的模型、参数和对比列表。
  useEffect(() => {
    if (previousCreationType.current === creationType) return
    previousCreationType.current = creationType
    setModelId(undefined)
    setValues({})
    setCompareModels([])
    setCreativeAssets([])
    setCharacterSessionRecords([])
    setSelectedCharacterRecordId(undefined)
    setFieldErrors(new Map())
    setEstimate(null)
  }, [creationType])

  useEffect(() => {
    if (creativeAssetId !== null) setCreativePickerOpen(true)
  }, [creativeAssetId])

  // `?reuse=<id>` 深链：从历史生成记录还原模型与全部参数（含参考图）。
  // 每个 reuse id 只在首次进入时还原一次：还原完成（或失败）后用 ref 记录，
  // 之后用户切换模型不会再被记录里的模型弹回（此前 effect 依赖 modelId/model，
  // 切换模型即重新还原并 setModelId 弹回，导致级联末级 select「选不中」）。
  const reuseId = searchParams.get('reuse')
  const handledReuseRef = useRef<string | null>(null)
  useEffect(() => {
    if (reuseId === null) return
    if (handledReuseRef.current === reuseId) return
    let cancelled = false
    setIsRestoring(true)
    apiClient
      .getGeneration(reuseId)
      .then(record => {
        if (cancelled) return
        const recordModel = selectModelById(availableModels, record.modelId)
        if (recordModel === undefined) return // 目录未就绪：本次作罢，models 就绪后由 effect 再次触发
        setModelId(record.modelId)
        void restoreRecordParams(record.inputParams, record.assetRefs, recordModel).then(restored => {
          if (cancelled) return
          handledReuseRef.current = reuseId
          setValues(restored.values)
        })
      })
      .catch(() => {
        handledReuseRef.current = reuseId
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [availableModels, reuseId])

  // 从带深链参数（?reuse= / ?params= / ?edit= / ?ref=）进入 /create 后，再导航到
  // 无参 /create（如点侧栏「创作」）时重置为空白表单。React Router 同路由仅 query
  // 变化不会重挂组件，还原进本地 useState 的内容需显式清空。
  const deepLinkKeys = ['reuse', 'params', 'edit', 'ref', 'select', 'creativeAssetId', 'assetType'] as const
  useEffect(() => {
    const hasIntent = deepLinkKeys.some(key => searchParams.get(key) !== null)
    if (hasIntent) return
    setModelId(undefined)
    setValues({})
    setFieldErrors(new Map())
    setEstimate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 切换模型：重建默认值、清空预估与错误
  useEffect(() => {
    setFieldErrors(new Map())
    setEstimate(null)
    if (model !== undefined) {
      const defaults: Record<string, unknown> = {}
      for (const parameter of model.parameters) {
        if (parameter.defaultValue !== undefined) defaults[parameter.name] = parameter.defaultValue
      }
      if (creationType === 'character') {
        const sizeParameter = model.parameters.find(parameter => parameter.name === 'size')
        if (defaults.size === undefined && sizeParameter?.options?.[0] !== undefined) {
          defaults.size = sizeParameter.options[0].value
        }
        const countParameter = model.parameters.find(parameter => parameter.name === 'n')
        if (defaults.n === undefined && countParameter !== undefined) {
          defaults.n = countParameter.min ?? 1
        }
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
        .estimateGeneration({ modelId: model.id, params, assetRefs, ...(creativeContext === undefined ? {} : { creativeContext }) })
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
  }, [creativeContext, model, values])

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

  const creativeReferenceItems = useMemo(
    () => creativeAssetReferencesToAssetItems(creativeAssets),
    [creativeAssets],
  )
  const creativeMediaField = mediaFields.find(field => field.parameter.mediaKind === 'image')
  // 提示词 @ 引用的参考池：以 `references` 媒体字段（参考素材）为唯一事实源。
  const referencePool = creativeReferenceItems.length > 0
    ? creativeReferenceItems
    : Array.isArray(values.references) ? values.references : []

  const handleValueChange = (name: string, value: unknown) => {
    if (creativeAssets.length > 0 && mediaFields.some(field => field.parameter.name === name)) {
      setCreativeAssets([])
    }
    setValues(current => ({ ...current, [name]: value }))
    // 字段值一旦变化，立即清除该字段的旧校验错误（如选完参考图后「为必填」红字应消失）。
    setFieldErrors(current => {
      if (current.size === 0 || !current.has(name)) return current
      const next = new Map(current)
      next.delete(name)
      return next
    })
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
    // 客户端必填校验：缺失时字段级红字提示，不发请求（避免通用「输入内容不合法」）。
    const missing = missingRequiredFields(visibleFormFields(schema, values), values)
    if (missing.length > 0) {
      setFieldErrors(new Map(missing.map(field => [field.parameter.name, {
        field: field.parameter.name,
        code: 'REQUIRED',
        message: `${field.parameter.label}为必填`,
      }])))
      notifyError('请先补全必填项')
      return
    }
    // 提交前用 model-core 实时校验：范围/步长/条件上限/media 数量/文本长度等，与服务端
    // 等价，关闭「前端能提交、提交才被拒」的 gap（如 vidu seed 区间、wan2.7 含参考
    // 视频时长上限、素材数量上限）。
    const validation = validateModelParams(model, buildValidationParams(model, values))
    if (!validation.valid) {
      setFieldErrors(parameterIssuesToFieldErrors(validation.errors))
      notifyError('请修正参数后再提交')
      return
    }
    setFieldErrors(new Map())
    setIsSubmitting(true)
    try {
      const { params, assetRefs } = buildSubmitPayload(model, values)
      const payload = { modelId: model.id, params, assetRefs, ...(creativeContext === undefined ? {} : { creativeContext }) }
      const idempotencyKey = idempotencyKeyFor(payload)
      const created = await apiClient.createGeneration({ ...payload, idempotencyKey })
      clearIdempotencyKey(payload)
      rememberRecentModelId(model.id)
      if (creationType === 'character') {
        setCharacterSessionRecords(current => [created.record, ...current.filter(record => record.id !== created.record.id)])
        setSelectedCharacterRecordId(created.record.id)
        // 人物创建是一条提示词一次生成；生成成功后清空输入，让用户自行决定下一次要补哪一部分。
        setValues(current => ({ ...current, prompt: undefined }))
      }
      void refreshGenerations()
      showMessage({ title: '已提交生成任务', tone: 'success' })
      // 保留模型、参考图和其它参数；人物提示词已在上面按一次生成语义清空。
      setEstimate(null)
    } catch (error) {
      notifyError(error)
      setFieldErrors(readParameterValidationErrors(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  /** 对比生成：用当前表单的提示词/文本参数，对选中的每个模型各提交一条（同 batchId）。 */
  const handleCompareSubmit = async () => {
    if (compareBusy || (creationIntent.imageOnly && (model === undefined || compareModels.length === 0)) || (!creationIntent.imageOnly && compareModels.length === 0)) return
    const selectedModels = creationIntent.imageOnly
      ? [model, ...compareModels].filter((candidate): candidate is ModelCatalogItem => candidate !== undefined)
      : compareModels
    const targetModels = selectedModels.filter(
      (candidate, index) => selectedModels.findIndex(item => item.id === candidate.id) === index,
    )
    if (targetModels.length === 0) return
    setCompareBusy(true)
    const batchId = crypto.randomUUID()
    let submitted = 0
    for (const compareModel of targetModels) {
      // 提交前实时校验：跳过不满足该模型约束的对比项（与服务端等价）。
      const validation = validateModelParams(compareModel, buildValidationParams(compareModel, values))
      if (!validation.valid) {
        const first = validation.errors[0]
        showMessage({
          title: `${modelNameZh(compareModel)}：${first?.messages['zh-CN'] ?? '参数不合法'}`,
          tone: 'warning',
        })
        continue
      }
      const { params, assetRefs } = buildSubmitPayload(compareModel, values)
      const compareCreativeContext = buildCreativeGenerationContext({
        model: compareModel,
        prompt: typeof values.prompt === 'string' ? values.prompt : '',
        negativePrompt: typeof values.negativePrompt === 'string' ? values.negativePrompt : undefined,
        projectId,
        assets: creativeAssets,
      })
      const payload = { modelId: compareModel.id, params, assetRefs, ...(compareCreativeContext === undefined ? {} : { creativeContext: compareCreativeContext }) }
      const idempotencyKey = idempotencyKeyFor(payload)
      try {
        const created = await apiClient.createGeneration({ ...payload, idempotencyKey, batchId })
        clearIdempotencyKey(payload)
        if (creationType === 'character') {
          setCharacterSessionRecords(current => [created.record, ...current.filter(record => record.id !== created.record.id)])
          setSelectedCharacterRecordId(created.record.id)
        }
        submitted += 1
      } catch (error) {
        showMessage({ title: `${modelNameZh(compareModel)}：${userErrorMessage(error)}`, tone: 'warning' })
      }
    }
    if (submitted > 0) {
      if (creationType === 'character') {
        setValues(current => ({ ...current, prompt: undefined }))
      }
      void refreshGenerations()
      showMessage({ title: `已提交 ${submitted} 个对比任务`, tone: 'success' })
    }
    setCompareBusy(false)
  }

  // 人物工作台只展示本次创建的任务；生成记录 store 会持续回填状态和产物，
  // 因此这里按 id 合并，避免把执行记录误当成新的聊天实体。
  const characterRecords = useMemo(() => {
    const merged = new Map(characterSessionRecords.map(record => [record.id, record]))
    const sessionIds = new Set(characterSessionRecords.map(record => record.id))
    for (const record of generationRecords) {
      if (sessionIds.has(record.id)) merged.set(record.id, record)
    }
    return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [characterSessionRecords, generationRecords])

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

  if (availableModels.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{creationIntent.eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{creationIntent.title}</h1>
        <p className="text-sm text-muted-foreground">当前模型目录中没有可用的图片模型，暂时无法创建这一类图片资产。</p>
      </div>
    )
  }

  if (creationType === 'character') {
    return (
      <>
        <CharacterCreationWorkspace
          availableModels={availableModels}
          model={model}
          modelId={modelId}
          onModelSelect={handleModelSelect}
          values={values}
          referencePool={referencePool}
          mediaFields={mediaFields}
          creativeMediaField={creativeMediaField}
          creativeAssets={creativeAssets}
          onOpenCreativePicker={() => setCreativePickerOpen(true)}
          onRemoveCreativeAsset={assetId => {
            const next = creativeAssets.filter(asset => asset.id !== assetId)
            setCreativeAssets(next)
            if (creativeMediaField !== undefined) {
              setValues(current => ({ ...current, [creativeMediaField.parameter.name]: creativeAssetReferencesToAssetItems(next) }))
            }
          }}
          basicSettingsFields={basicSettingsFields}
          advancedSettingsFields={advancedSettingsFields}
          fieldErrors={fieldErrors}
          onValueChange={handleValueChange}
          onSubmit={handleSubmit}
          estimate={estimate}
          estimating={estimating}
          isSubmitting={isSubmitting}
          isRestoring={isRestoring}
          records={characterRecords}
          selectedRecordId={selectedCharacterRecordId}
          onSelectRecord={setSelectedCharacterRecordId}
        />
        <CreativeAssetPickerDialog
          open={creativePickerOpen}
          onOpenChange={setCreativePickerOpen}
          {...(creativeAssetId === null ? {} : { initialAssetId: creativeAssetId })}
          onSelect={assets => {
            setCreativeAssets(assets)
            if (creativeMediaField !== undefined) {
              setValues(current => ({ ...current, [creativeMediaField.parameter.name]: creativeAssetReferencesToAssetItems(assets) }))
            }
          }}
        />
      </>
    )
  }

  const compareModelCount = creationIntent.imageOnly ? compareModels.length + 1 : compareModels.length

  return (
    <form onSubmit={handleSubmit} className="mx-auto grid max-w-7xl gap-8 xl:grid-cols-2">
      <header className="col-span-full flex flex-col justify-between gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">{creationIntent.eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{creationIntent.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{creationIntent.description}</p>
        </div>
        <p className="max-w-xs text-xs leading-5 text-muted-foreground sm:text-right">
          {creationIntent.imageOnly
            ? '这里只展示图片模型；生成完成后，可在生成详情中收录为人物、场地或道具。'
            : '生成完成后，可在生成详情中收录为结构化资产。'}
        </p>
      </header>
      {/* 左栏：模型下拉 + 表单（无卡片边框）。xl 下两栏各自独立滚动（OverlayScrollbars
          虚拟滚动条），表单很长时不连带滚走最近任务。 */}
      <VirtualScrollArea className="xl:max-h-[calc(100svh-3rem)]">
        <div className="space-y-6 xl:pl-1 xl:pr-4 xl:pb-8">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">选择模型</h2>
          <ModelSelector
            models={availableModels}
            selectedId={modelId}
            onSelect={handleModelSelect}
            defaultCategory={creationIntent.imageOnly ? 'image' : 'video'}
          />
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
                <p className="text-sm font-medium">{creationIntent.imageOnly ? '参考图片' : '输入参考素材'}</p>
                {creativeMediaField !== undefined && (
                  <CreativeAssetReferencePanel
                    assets={creativeAssets}
                    onOpen={() => setCreativePickerOpen(true)}
                    onRemove={assetId => {
                      const next = creativeAssets.filter(asset => asset.id !== assetId)
                      setCreativeAssets(next)
                      setValues(current => ({ ...current, [creativeMediaField.parameter.name]: creativeAssetReferencesToAssetItems(next) }))
                    }}
                  />
                )}
                <ParameterForm
                  fields={mediaFields}
                  values={values}
                  onChange={handleValueChange}
                  errors={fieldErrors}
                />
              </div>
            )}

            <div className="space-y-2">
              {creationIntent.promptGuide !== null && (
                <CreationPromptGuide
                  title={creationIntent.promptGuide.title}
                  description={creationIntent.promptGuide.description}
                  onApply={() => setValues(current => ({
                    ...current,
                    prompt: typeof current.prompt === 'string' && current.prompt.trim().length > 0
                      ? `${current.prompt.trim()}\n${creationIntent.promptGuide?.template ?? ''}`
                      : creationIntent.promptGuide?.template,
                  }))}
                />
              )}
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
              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || isRestoring || model === undefined}>
                {isSubmitting ? '提交中…' : isRestoring ? '正在还原参数…' : '开始生成'}
              </Button>
              <CreationPresetPanel
                modelId={model.id}
                params={values}
                disabled={isSubmitting}
                allowedModelIds={creationIntent.imageOnly ? availableModels.map(item => item.id) : undefined}
                onApply={preset => {
                  setModelId(preset.modelId)
                  setValues(preset.params)
                }}
              />

              {/* 对比生成：同提示词多模型并行提交（同一 batchId）。 */}
              <Collapsible defaultOpen={creationIntent.imageOnly} className="group space-y-2 rounded-lg border border-dashed p-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    {creationIntent.imageOnly ? '选择多个图片模型' : '对比生成（同提示词多模型）'}
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {creationIntent.imageOnly
                      ? '主模型会与这里追加的图片模型一起生成。支持文生图、图生图和参考生图；不会混入视频模型。'
                      : '用当前提示词/文本参数对多个模型各提交一条对比任务。参考图/媒体参数不跨模型复用；请选择同一类模型以获得可比结果。'}
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
                      <ModelCompareAdd
                        models={availableModels}
                        compareIds={compareModels.map(item => item.id)}
                        excludeIds={model === undefined ? [] : [model.id]}
                        onAdd={candidate => setCompareModels(current => [...current, candidate])}
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={compareModels.length === 0 || compareBusy || model === undefined}
                    onClick={() => void handleCompareSubmit()}
                  >
                    {compareBusy ? <Loader2 className="size-4 animate-spin" /> : creationIntent.imageOnly ? `批量生成（${compareModelCount} 个图片模型）` : `开始对比（${compareModelCount} 个模型）`}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </section>
        )}
        </div>
      </VirtualScrollArea>

      {/* 右栏：最近任务（与左栏以竖分割线隔开）。xl 下固定高度、独立滚动。 */}
      <VirtualScrollArea className="xl:max-h-[calc(100svh-3rem)] xl:border-l xl:border-border">
        <div className="xl:pl-8 xl:pr-4 xl:pb-8">
          <GenerationsPanel variant="embedded" />
        </div>
      </VirtualScrollArea>

      <CreativeAssetPickerDialog
        open={creativePickerOpen}
        onOpenChange={setCreativePickerOpen}
        {...(creativeAssetId === null ? {} : { initialAssetId: creativeAssetId })}
        onSelect={assets => {
          setCreativeAssets(assets)
          if (creativeMediaField !== undefined) {
            setValues(current => ({ ...current, [creativeMediaField.parameter.name]: creativeAssetReferencesToAssetItems(assets) }))
          }
        }}
      />
    </form>
  )
}

type CharacterCreationWorkspaceProps = {
  availableModels: readonly ModelCatalogItem[]
  model: ModelCatalogItem | undefined
  modelId: string | undefined
  onModelSelect: (modelId: string) => void
  values: Record<string, unknown>
  referencePool: readonly AssetItem[]
  mediaFields: readonly FormField[]
  creativeMediaField: FormField | undefined
  creativeAssets: readonly CreativeAssetDetail[]
  onOpenCreativePicker: () => void
  onRemoveCreativeAsset: (assetId: string) => void
  basicSettingsFields: readonly FormField[]
  advancedSettingsFields: readonly FormField[]
  fieldErrors: ReadonlyMap<string, FieldIssue>
  onValueChange: (name: string, value: unknown) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  estimate: GenerationEstimate | null
  estimating: boolean
  isSubmitting: boolean
  isRestoring: boolean
  records: readonly GenerationRecord[]
  selectedRecordId: string | undefined
  onSelectRecord: (recordId: string) => void
}

function CharacterCreationWorkspace({
  availableModels,
  model,
  modelId,
  onModelSelect,
  values,
  referencePool,
  mediaFields,
  creativeMediaField,
  creativeAssets,
  onOpenCreativePicker,
  onRemoveCreativeAsset,
  basicSettingsFields,
  advancedSettingsFields,
  fieldErrors,
  onValueChange,
  onSubmit,
  estimate,
  estimating,
  isSubmitting,
  isRestoring,
  records,
  selectedRecordId,
  onSelectRecord,
}: CharacterCreationWorkspaceProps) {
  const selectedRecord = records.find(record => record.id === selectedRecordId) ?? records[0]

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex h-[calc(100svh-5rem)] min-h-[620px] w-full max-w-[1500px] flex-col gap-4 md:h-[calc(100svh-6rem)]"
    >
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
        <section aria-labelledby="character-history-title" className="flex min-h-[28rem] min-w-0 flex-col lg:pr-2">
          <div className="flex shrink-0 items-end justify-between gap-3 pb-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Generation history</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 id="character-history-title" className="text-sm font-semibold">创作轨迹</h2>
                <span className="text-xs text-muted-foreground">{records.length > 0 ? `${records.length} 次生成` : '还没有生成记录'}</span>
              </div>
            </div>
            {records.length > 0 && <span className="text-xs text-muted-foreground">点击任意一条查看预览</span>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {records.length > 0 && (
              <div className="space-y-3 pb-2">
                {records.map(record => (
                  <CharacterPromptRow
                    key={record.id}
                    record={record}
                    selected={record.id === selectedRecord?.id}
                    onSelect={() => onSelectRecord(record.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside aria-labelledby="character-preview-title" className="flex min-h-[20rem] min-w-0 flex-col lg:min-h-0 lg:border-l lg:border-border lg:pl-6">
          <div className="flex shrink-0 items-center justify-between pb-3">
            <div>
              <h2 id="character-preview-title" className="mt-1 text-sm font-semibold">生成缩略图</h2>
            </div>
            {records.length > 0 && <span className="text-xs text-muted-foreground">{records.reduce((total, record) => total + characterMediaArtifacts(record).length, 0)} 张</span>}
          </div>
          <div className="min-h-0 flex-1">
            <CharacterPreviewPanel records={records} selectedRecordId={selectedRecord?.id} onSelectRecord={onSelectRecord} />
          </div>
        </aside>
      </div>

      <div className="shrink-0 bg-background/95 pt-3 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl rounded-[22px] border border-border bg-card px-4 pt-3 shadow-[0_10px_30px_rgb(0_0_0_/_0.08)] transition-shadow focus-within:shadow-[0_12px_36px_rgb(0_0_0_/_0.12)]">
          <div className="flex min-h-[7.5rem] gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <CharacterReferenceSlot asset={referencePool[0]} />
              </DropdownMenuTrigger>
              <CharacterReferencePopover
                mediaFields={mediaFields}
                creativeMediaField={creativeMediaField}
                creativeAssets={creativeAssets}
                values={values}
                fieldErrors={fieldErrors}
                onValueChange={onValueChange}
                onOpenCreativePicker={onOpenCreativePicker}
                onRemoveCreativeAsset={onRemoveCreativeAsset}
              />
            </DropdownMenu>
            <div className="min-w-0 flex-1">
              <PromptInput
                value={typeof values.prompt === 'string' ? values.prompt : ''}
                refs={referencePool}
                onChange={text => onValueChange('prompt', text)}
                placeholder="上传参考图、输入文字或 @ 主体，描述你想生成的人物。"
                disabled={isSubmitting || isRestoring || model === undefined}
                supportsReferences={model?.referenceFormat !== undefined}
                className="min-h-[7.5rem] rounded-none border-0 bg-transparent px-0 py-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs text-primary">
                    <ImagePlus data-icon="inline-start" />
                    图片生成
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <CharacterGenerationModePopover models={availableModels} selectedId={modelId} onSelect={onModelSelect} />
              </DropdownMenu>
              {model !== undefined && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 max-w-44 gap-1.5 text-xs">
                      <Sparkles data-icon="inline-start" />
                      <span className="truncate">{modelNameZh(model)}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <CharacterModelPopover models={availableModels} selectedId={modelId} onSelect={onModelSelect} />
                </DropdownMenu>
              )}
              {basicSettingsFields.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 max-w-52 gap-1.5 text-xs">
                      <span className="truncate">{characterSettingsSummary(basicSettingsFields, values)}</span>
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                  </DropdownMenuTrigger>
                  <CharacterSettingsPopover
                    basicSettingsFields={basicSettingsFields}
                    advancedSettingsFields={advancedSettingsFields}
                    values={values}
                    fieldErrors={fieldErrors}
                    onValueChange={onValueChange}
                  />
                </DropdownMenu>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                ✦ {estimating ? '计算中…' : estimate !== null ? `${formatCents(estimate.costEstimate)}/张` : '—/张'}
              </span>
              <Button type="submit" size="icon-lg" className="rounded-full" disabled={isSubmitting || isRestoring || model === undefined} aria-label={isSubmitting ? '生成中' : '确定生成'}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

function CharacterReferenceSlot({ asset }: { asset: AssetItem | undefined }) {
  return (
    <button
      type="button"
      className="relative mt-1 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted/70 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={asset === undefined ? '上传参考图' : '添加或更换参考图'}
    >
      {asset === undefined ? <Plus className="size-5" /> : <AssetThumbnail kind={asset.kind} url={asset.url} thumbnailUrl={asset.thumbnailUrl} />}
      {asset !== undefined && (
        <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
          <Plus className="size-3.5" />
        </span>
      )}
    </button>
  )
}

function characterSettingsSummary(fields: readonly FormField[], values: Readonly<Record<string, unknown>>) {
  const sizeField = fields.find(field => field.parameter.name === 'size')
  const countField = fields.find(field => field.parameter.name === 'n')
  const sizeOption = sizeField?.parameter.options?.find(option => JSON.stringify(option.value) === JSON.stringify(values.size))
  const size = sizeOption === undefined ? undefined : characterSizeChoice(sizeOption)
  const summary = [size?.ratio, size?.resolution, countField === undefined ? undefined : values[countField.parameter.name]]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
  return summary.slice(0, 3).join(' · ') || '输出参数'
}

function CharacterGenerationModePopover({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
}) {
  const selected = models.find(model => model.id === selectedId)
  const modes = [...new Set(models.map(model => subModeOf(model)))]

  return (
    <DropdownMenuContent side="top" align="start" className="w-[min(18rem,calc(100vw-2rem))]">
      <DropdownMenuLabel>选择图片生成方式</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuRadioGroup
          value={selected === undefined ? '' : subModeOf(selected)}
          onValueChange={mode => {
            const modeModel = firstEnabledModel(models, 'image', mode as SubMode)
            if (modeModel !== undefined) onSelect(modeModel.id)
          }}
        >
          {modes.map(mode => {
            const modeModel = firstEnabledModel(models, 'image', mode)
            if (modeModel === undefined) return null
            return (
              <DropdownMenuRadioItem key={mode} value={mode} className="items-start py-2.5">
                <ImagePlus data-icon="inline-start" className="mt-0.5 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{SUB_MODE_LABELS[mode]}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{modelNameZh(modeModel)}</span>
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )
}

function CharacterModelPopover({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly ModelCatalogItem[]
  selectedId: string | undefined
  onSelect: (modelId: string) => void
}) {
  const selected = models.find(model => model.id === selectedId)

  return (
    <DropdownMenuContent side="top" align="center" className="w-[min(32rem,calc(100vw-2rem))]">
      <DropdownMenuLabel>
        <span className="block">选择模型</span>
        <span className="mt-1 block truncate text-sm font-medium text-foreground">{selected === undefined ? '图片生成' : `${modelNameZh(selected)} · ${selected.displayName}`}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuRadioGroup value={selectedId ?? ''} onValueChange={onSelect}>
          {models.map(candidate => {
            const enabled = isModelEnabled(candidate)
            return (
              <DropdownMenuRadioItem key={candidate.id} value={candidate.id} disabled={!enabled} className="items-start py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background text-foreground">
                  <Sparkles data-icon="inline-start" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{modelNameZh(candidate)}</span>
                    {candidate.availability?.notActivated !== undefined && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{candidate.availability.notActivated}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{candidate.description ?? candidate.displayName}</span>
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )
}

function CharacterSettingsPopover({
  basicSettingsFields,
  advancedSettingsFields,
  values,
  fieldErrors,
  onValueChange,
}: {
  basicSettingsFields: readonly FormField[]
  advancedSettingsFields: readonly FormField[]
  values: Record<string, unknown>
  fieldErrors: ReadonlyMap<string, FieldIssue>
  onValueChange: (name: string, value: unknown) => void
}) {
  const allFields = [...basicSettingsFields, ...advancedSettingsFields].filter(
    field => !CHARACTER_HIDDEN_PARAM_NAMES.has(field.parameter.name),
  )
  const sizeField = allFields.find(field => field.parameter.name === 'size')
  const countField = allFields.find(field => field.parameter.name === 'n')
  const remainingFields = allFields.filter(field => field !== sizeField && field !== countField)

  return (
    <DropdownMenuContent side="top" align="center" className="w-[min(31rem,calc(100vw-2rem))] p-4">
      <DropdownMenuLabel className="px-0">
        <span className="block">输出设置</span>
        <span className="mt-1 block text-sm font-medium text-foreground">比例、分辨率和生成数量</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {sizeField !== undefined && <CharacterSizeControl field={sizeField} value={values[sizeField.parameter.name]} onChange={value => onValueChange(sizeField.parameter.name, value)} />}
      {countField !== undefined && <CharacterCountControl field={countField} value={values[countField.parameter.name]} onChange={value => onValueChange(countField.parameter.name, value)} />}
      {remainingFields.length > 0 && (
        <section className="mt-4 space-y-3">
          <Separator />
          <p className="mb-3 text-xs font-medium text-muted-foreground">更多参数</p>
          <ParameterForm fields={remainingFields} values={values} onChange={onValueChange} errors={fieldErrors} layout="grid" />
        </section>
      )}
    </DropdownMenuContent>
  )
}

function CharacterSizeControl({ field, value, onChange }: { field: FormField; value: unknown; onChange: (value: unknown) => void }) {
  const choices = (field.parameter.options ?? []).map(characterSizeChoice)
  const selected = choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(value)) ?? choices[0]
  const ratios = [...new Set(choices.map(choice => choice.ratio).filter((ratio): ratio is string => ratio !== undefined))]
  const resolutions = [...new Set(choices.map(choice => choice.resolution).filter((resolution): resolution is string => resolution !== undefined))]
  const selectChoice = (key: 'ratio' | 'resolution', next: string) => {
    const otherKey = key === 'ratio' ? 'resolution' : 'ratio'
    const match = choices.find(choice => choice[key] === next && selected?.[otherKey] === choice[otherKey]) ?? choices.find(choice => choice[key] === next)
    if (match !== undefined) onChange(match.value)
  }

  if (choices.length === 0) return null

  return (
    <div className="space-y-3">
      {ratios.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">选择比例</p>
          <ToggleGroup
            type="single"
            value={selected?.ratio ?? ''}
            onValueChange={next => {
              if (next !== '') selectChoice('ratio', next)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            className="grid w-full grid-cols-4 rounded-xl bg-muted/60 p-1"
            aria-label="选择比例"
          >
            {ratios.map(ratio => <ToggleGroupItem key={ratio} value={ratio} className="rounded-lg border-0 px-2 py-2 text-xs shadow-none data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:shadow-sm">{ratio}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">选择分辨率</p>
        <ToggleGroup
          type="single"
          value={selected?.resolution ?? ''}
          onValueChange={next => {
            if (next !== '') selectChoice('resolution', next)
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="grid w-full grid-cols-4 rounded-xl bg-muted/60 p-1"
          aria-label="选择分辨率"
        >
          {resolutions.map(resolution => <ToggleGroupItem key={resolution} value={resolution} className="rounded-lg border-0 px-2 py-2 text-xs shadow-none data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:shadow-sm">{resolution}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <p className="text-[11px] text-muted-foreground">当前尺寸：{selected?.label ?? '—'}</p>
    </div>
  )
}

function CharacterCountControl({ field, value, onChange }: { field: FormField; value: unknown; onChange: (value: unknown) => void }) {
  const min = Math.ceil(field.parameter.min ?? 1)
  const max = Math.min(Math.ceil(field.parameter.max ?? 8), 12)
  const current = typeof value === 'number' ? value : min
  const counts = Array.from({ length: Math.max(1, max - min + 1) }, (_, index) => min + index)

  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-xs text-muted-foreground">选择生成数量</p>
      <ToggleGroup
        type="single"
        value={String(current)}
        onValueChange={next => {
          if (next !== '') onChange(Number(next))
        }}
        variant="outline"
        size="sm"
        spacing={0}
        className="grid w-full grid-cols-6 rounded-xl bg-muted/60 p-1"
        aria-label="选择生成数量"
      >
        {counts.map(count => <ToggleGroupItem key={count} value={String(count)} className="rounded-lg border-0 px-2 py-2 text-xs shadow-none data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:shadow-sm">{count}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  )
}

function CharacterReferencePopover({
  mediaFields,
  creativeMediaField,
  creativeAssets,
  values,
  fieldErrors,
  onValueChange,
  onOpenCreativePicker,
  onRemoveCreativeAsset,
}: {
  mediaFields: readonly FormField[]
  creativeMediaField: FormField | undefined
  creativeAssets: readonly CreativeAssetDetail[]
  values: Record<string, unknown>
  fieldErrors: ReadonlyMap<string, FieldIssue>
  onValueChange: (name: string, value: unknown) => void
  onOpenCreativePicker: () => void
  onRemoveCreativeAsset: (assetId: string) => void
}) {
  return (
    <DropdownMenuContent side="top" align="start" className="w-[min(32rem,calc(100vw-2rem))] p-4">
      <DropdownMenuLabel className="px-0">
        <span className="block">参考图与素材</span>
        <span className="mt-1 block text-sm font-medium text-foreground">上传图片，或引用已确认的创意资产</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {creativeMediaField !== undefined && <CreativeAssetReferencePanel assets={creativeAssets} onOpen={onOpenCreativePicker} onRemove={onRemoveCreativeAsset} />}
      {mediaFields.length > 0 ? (
        <div className={cn(creativeMediaField !== undefined && 'mt-4 space-y-3')}>
          {creativeMediaField !== undefined && <Separator />}
          <p className="mb-3 text-xs font-medium text-muted-foreground">上传参考图 / 素材</p>
          <ParameterForm fields={mediaFields} values={values} onChange={onValueChange} errors={fieldErrors} />
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 px-3 py-4 text-xs text-muted-foreground">当前模型不需要参考素材。</p>
      )}
    </DropdownMenuContent>
  )
}

function characterSizeChoice(option: { label: string; value: unknown }): CharacterSizeChoice {
  const source = `${option.label} ${String(option.value)}`
  const dimensions = source.match(/(\d{3,5})\s*[×x*]\s*(\d{3,5})/i)
  const ratioMatch = option.label.match(/\b(\d+\s*:\s*\d+)\b/)
  const resolutionMatch = source.match(/\b([1248]K)\b/i)
  const widthText = dimensions?.[1]
  const heightText = dimensions?.[2]
  const width = widthText === undefined ? undefined : Number(widthText)
  const height = heightText === undefined ? undefined : Number(heightText)
  const divisor = width === undefined || height === undefined ? 0 : gcd(width, height)
  const ratioText = ratioMatch?.[1]
  const resolutionText = resolutionMatch?.[1]
  const ratio = ratioText === undefined ? (width !== undefined && height !== undefined ? `${width / (divisor || 1)}:${height / (divisor || 1)}` : undefined) : ratioText.replace(/\s/g, '')
  const resolution = resolutionText === undefined ? (width !== undefined && height !== undefined ? `${Math.max(width, height) >= 3500 ? 4 : Math.max(width, height) >= 1800 ? 2 : 1}K` : undefined) : resolutionText.toUpperCase()
  return { label: option.label, value: option.value, ratio, resolution }
}

type CharacterSizeChoice = {
  label: string
  value: unknown
  ratio: string | undefined
  resolution: string | undefined
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function CharacterPromptRow({ record, selected, onSelect }: { record: GenerationRecord; selected: boolean; onSelect: () => void }) {
  const prompt = typeof record.inputParams.prompt === 'string' ? record.inputParams.prompt : '未填写人物提示词'
  const artifacts = characterMediaArtifacts(record)

  return (
    <article className={cn('overflow-hidden rounded-2xl py-2 transition-colors', selected ? 'bg-primary/[0.025]' : 'hover:bg-muted/20')}>
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">我</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{relativeTime(record.createdAt)}</span>
            <StatusBadge status={record.status} />
          </span>
          <span className="mt-1.5 block line-clamp-2 text-sm leading-6 text-foreground">{prompt}</span>
        </span>
      </button>
      <div className="px-3 py-3">
        {artifacts.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {artifacts.slice(0, 4).map((artifact, index) => (
              <button key={`${record.id}-${index}`} type="button" onClick={onSelect} className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-muted/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`查看第 ${index + 1} 张人物设定图`}>
                <AssetThumbnail kind={artifact.kind} url={artifact.sourceUrl} thumbnailUrl={artifact.thumbnailUrl} className="transition-transform duration-300 group-hover:scale-105" />
                {index === 3 && artifacts.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white">+{artifacts.length - 4}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
            {record.status === 'failed' ? <X className="size-4 text-destructive" /> : <Loader2 className="size-4 animate-spin" />}
            {record.status === 'failed' ? '这次生成没有完成，可以修改提示词后重试。' : '正在等待人物设定图…'}
          </div>
        )}
      </div>
    </article>
  )
}

function CharacterPreviewPanel({
  records,
  selectedRecordId,
  onSelectRecord,
}: {
  records: readonly GenerationRecord[]
  selectedRecordId: string | undefined
  onSelectRecord: (recordId: string) => void
}) {
  const completedArtifacts = records.flatMap(record => characterMediaArtifacts(record).map((artifact, index) => ({ artifact, index, record })))

  if (records.length === 0) return null

  if (completedArtifacts.length === 0) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-3 pb-2">
        {completedArtifacts.map(({ artifact, index, record }) => (
          <button
            key={`${record.id}-preview-${index}`}
            type="button"
            onClick={() => onSelectRecord(record.id)}
            className={cn('group relative block aspect-square w-full overflow-hidden rounded-xl bg-muted/30 text-left transition-[box-shadow,opacity]', selectedRecordId === record.id ? 'ring-2 ring-primary/30' : 'opacity-80 hover:opacity-100')}
            aria-label={`查看 ${typeof record.inputParams.prompt === 'string' ? record.inputParams.prompt : '人物设定'} 的第 ${index + 1} 张缩略图`}
            title={typeof record.inputParams.prompt === 'string' ? record.inputParams.prompt : '人物设定图'}
          >
            <AssetThumbnail kind={artifact.kind} url={artifact.sourceUrl} thumbnailUrl={artifact.thumbnailUrl} className="transition-transform duration-300 group-hover:scale-105" />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-8 text-[11px] text-white">
              <span>第 {index + 1} 张</span>
              <span>{relativeTime(record.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function characterMediaArtifacts(record: GenerationRecord) {
  return (record.outputResult?.artifacts ?? []).filter(artifact => artifact.kind === 'image' || artifact.kind === 'video')
}

function CreativeAssetReferencePanel({
  assets,
  onOpen,
  onRemove,
}: {
  assets: readonly CreativeAssetDetail[]
  onOpen: () => void
  onRemove: (assetId: string) => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-medium">已确认创意资产</p><p className="mt-1 text-xs text-muted-foreground">引用版本和参考图会写入本次生成快照</p></div>
        <Button type="button" size="sm" variant="outline" onClick={onOpen}><Sparkles className="size-3.5" />选择创意资产</Button>
      </div>
      {assets.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{assets.map(asset => <div key={asset.id} className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-background/70 px-2 py-1.5"><span className="size-7 overflow-hidden rounded bg-muted">{asset.preview?.thumbnailUrl || asset.preview?.url ? <img src={resolveApiUrl(asset.preview.thumbnailUrl ?? asset.preview.url)} alt="" className="size-full object-cover" /> : <ImageIcon className="m-1.5 size-4 text-muted-foreground" />}</span><span className="max-w-36 truncate text-xs">{asset.name}</span><button type="button" aria-label={`移除${asset.name}`} onClick={() => onRemove(asset.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3" /></button></div>)}</div>}
    </div>
  )
}

function CreationPromptGuide({
  title,
  description,
  onApply,
}: {
  title: string
  description: string
  onApply: () => void
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button type="button" size="sm" variant="outline" onClick={onApply}>插入建议</Button>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

/** 对比生成：从模型目录挑选一个尚未加入对比列表的模型。 */
function ModelCompareAdd({
  models,
  compareIds,
  excludeIds,
  onAdd,
}: {
  models: readonly ModelCatalogItem[]
  compareIds: readonly string[]
  excludeIds: readonly string[]
  onAdd: (model: ModelCatalogItem) => void
}) {
  const available = models.filter(model => !compareIds.includes(model.id) && !excludeIds.includes(model.id))
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
