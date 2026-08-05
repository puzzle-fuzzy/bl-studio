/**
 * manifest 驱动架构的核心类型定义。
 *
 * 整个 Bailian Studio 系统对"一个 provider 模型"的全部认知，都来自 ModelManifest 这一份
 * 声明式描述：能力（capabilities）、强类型参数（parameters）、如何把参数分发到
 * provider 请求体（ProviderRequestMapping 的 ParameterBinding bindings，决定字段
 * 落到 input.prompt / input.media / parameters.xxx 等哪个位置）、如何把 provider
 * 响应归一化为 artifact（ProviderOutputMapping）、定价（PricingRule）。
 *
 * 设计意图：把"模型知识"从"调用 provider 的代码"中彻底抽离。DashScope provider 包
 * 的 buildDashScopeRequest 读取 manifest 的 bindings 决定每个字段落到请求体的哪个
 * 位置；因此【添加一个新模型参数 = 在 manifest 中新增一条 ParameterBinding】，
 * provider 代码无需改动；同理【新增一个新模型 = 新增一份 manifest 条目并注册】。
 *
 * 本文件是 model-core 的契约层（纯类型，零运行时代码）。model-core 是近 leaf 包——
 * 仅依赖 @bailian-studio/shared，绝不依赖 DB / provider runner / service。下游所有包
 * （task-engine、generation-repository、api、worker、provider-dashscope）都通过
 * 这些类型与 manifest 交互。
 */

/** 模型所属 provider。当前仅 DashScope（百炼 / Bailian）一家。 */
export type ModelProvider = 'dashscope'

/** 模型产出大类：图像 / 视频 / 音频 / 文本。决定 UI 分组与 artifact 解析路径。 */
export type ModelCategory = 'image' | 'video' | 'audio' | 'text'

/**
 * 模型的调用时序：
 *  - sync：客户端同步等待响应（部分 chat 模型、单图生成）
 *  - provider_async：提交后 provider 异步执行，需轮询直至完成（视频、部分图像）
 *  - stream：SSE 流式返回（部分 chat 模型）
 */
export type ModelTaskMode = 'sync' | 'provider_async' | 'stream'

/**
 * 模型在 prompt 中引用参考图时使用的占位符格式。
 *  - 'angle-bracket'（默认）: <<<image_1>>>
 *  - 'image-bracket': [Image 1]
 *  - 'chinese': 图1
 */
export type ReferenceFormat = 'angle-bracket' | 'image-bracket' | 'chinese'

/**
 * 模型对外声明的能力集合。UI 据此决定暴露哪些输入控件（如 negative_prompt、
 * image_input），调用方也可据此判断模型能否接受特定输入。
 */
export type ModelCapability =
  | 'text_prompt'
  | 'image_input'
  | 'video_input'
  | 'audio_input'
  | 'multi_reference'
  | 'negative_prompt'
  | 'seed'
  | 'streaming'

/** manifest 参数的取值类型，决定 UI 控件形态与 validation.ts 的校验分支。 */
export type ModelParameterType =
  | 'text'
  | 'number'
  | 'select'
  | 'boolean'
  | 'media'

/**
 * 可选的 UI/校验依赖：仅当另一个参数等于指定值时显示并校验本参数。
 * 这是独立于 pricing tier 的产品表单语义，不能复用价格条件。
 */
export interface ParameterVisibilityRule {
  field: string
  equals: unknown
}

/**
 * 模型参数的声明式定义。
 *
 * 关键约束：name 同时是 ProviderRequestMapping.bindings 与 PricingRule.quantityKey
 * 引用该参数的 key，三者通过 name 串联。required / defaultValue / options / min /
 * max / maxLength 既驱动 validation.ts 的校验，也驱动 UI 的控件渲染。
 */
export interface ModelParameter {
  name: string
  label: string
  type: ModelParameterType
  required?: boolean
  defaultValue?: unknown
  description?: string
  options?: Array<{ label: string; value: unknown }>
  min?: number
  max?: number
  /** 数值下界是否开区间（例如 top_p > 0）。 */
  exclusiveMin?: boolean
  /** 数值上界是否开区间（例如 temperature < 2）。 */
  exclusiveMax?: boolean
  /** 允许的数值增量。`1` 表示该参数只接受整数。 */
  step?: number
  maxLength?: number
  /** 有序媒体的数量范围。省略表示单条资产。 */
  minItems?: number
  maxItems?: number
  visibleWhen?: ParameterVisibilityRule
  /**
   * 仅对 `type: 'media'` 参数有意义：声明该输入期望的媒体种类（image / video /
   * audio / text）。前端「作品库」选择器据此过滤候选成品，避免把图像参数配上视频、
   * 或把音频参数配上图像。非 media 类型参数应留空。
   */
  mediaKind?: ModelCategory
}

/** 媒体数量组的可选激活条件。 */
export interface MediaGroupCondition {
  field: string
  present: boolean
}

/** 共享同一个 provider 上限的媒体参数的跨字段数量约束。 */
export interface MediaParameterGroup {
  parameters: string[]
  minItems?: number
  maxItems?: number
  when?: MediaGroupCondition
}

/**
 * ParameterBinding —— manifest 驱动机制的核心。
 *
 * 描述 manifest 中的某个参数（由 ProviderRequestMapping.bindings 的 key 索引）
 * 应当被 provider 请求构建器（DashScope provider 包的 buildDashScopeRequest）
 * 分发到 DashScope 请求体的哪个位置。target 取值决定落点：
 *  - 'input.prompt'             → 写入 body.input.prompt
 *  - 'input.media' + mediaType   → 写入 body.input.media 数组并附带该 mediaType
 *  - 'input.field' + field       → 写入 body.input.<field>（如 neg_prompt）
 *  - 'parameters.field' + field  → 写入 body.parameters.<field>（field 省略时用参数名）
 *  - 'ui.only'                   → 仅前端 UI 使用，不进入 provider 请求
 *
 * 这正是"新增参数无需改 provider 代码"的底层支撑——provider 代码只按 target 分发，
 * 具体有哪些参数完全由 manifest 决定。
 */
export type ParameterBinding =
  | { target: 'input.prompt' }
  | { target: 'input.media'; mediaType: string }
  | { target: 'input.field'; field: string; wrapInArray?: boolean }
  | { target: 'parameters.field'; field?: string; wrapInArray?: boolean }
  | { target: 'ui.only' }

/**
 * 描述如何向 DashScope 构建请求：endpoint、bindings，以及 kind 决定的请求体形态。
 *
 * kind 取值对应不同的请求体结构，由 DashScope provider 包的
 * buildDashScopeRequest 分发处理：
 *  - dashscope-chat：chat completions 风格（prompt 走 messages，可选 stream）
 *  - dashscope-image-message：图像生成（多图，参数走 messages 结构）
 *  - dashscope-image-flat：图像生成（参数扁平落到 input/parameters）
 *  - dashscope-video-task：异步视频任务（mediaMode 决定 media 数组形态）
 *  - dashscope-audio-task：异步音频任务
 *
 * bindings 把 manifest 参数映射到上述请求体的具体位置（见 ParameterBinding）。
 */
export type ProviderRequestMapping =
  | { kind: 'dashscope-chat'; endpoint: string; promptParam: string; stream?: boolean; bindings: Record<string, ParameterBinding> }
  | { kind: 'dashscope-image-message'; endpoint: string; bindings: Record<string, ParameterBinding> }
  | { kind: 'dashscope-image-flat'; endpoint: string; bindings: Record<string, ParameterBinding> }
  | { kind: 'dashscope-video-task'; endpoint: string; mediaMode: 'none' | 'single' | 'multi'; bindings: Record<string, ParameterBinding>; referenceFormat?: ReferenceFormat }
  | { kind: 'dashscope-audio-task'; endpoint: string; bindings: Record<string, ParameterBinding> }

/**
 * 描述如何把 provider 响应归一化为 artifact。kind 决定解析路径：
 *  - images-from-message-content：从 chat message content 提取图像 URL
 *  - video-url：从 output.video_url 取视频地址
 *  - audio-url：从 output.audio.url 取音频地址
 *  - text：从 output.text 取文本
 *  - custom：由 extractor 命名一个自定义解析器
 */
export type ProviderOutputMapping =
  | { kind: 'images-from-message-content' }
  | { kind: 'video-url'; path: 'output.video_url' }
  | { kind: 'audio-url'; path: 'output.audio.url' }
  | { kind: 'text'; path: 'output.text' | 'output.choices.0.message.content' }
  | { kind: 'asr-transcription' }
  | { kind: 'custom'; extractor: string }

/** 定价计费单位：按图 / 按秒（视频时长）/ 按 token（文本）/ 按音频条数。 */
export type PricingUnit = 'per_image' | 'per_second' | 'per_token' | 'per_audio'

/**
 * 定价阶梯。condition 为空对象即"默认阶梯"——registry-check.ts 强制有且仅有一个、
 * 且必须位于 tiers[0]；非空 condition 的字段需与参数值精确匹配才命中该阶梯。
 * priceCents 是【整数分（CNY）】，绝非浮点元——避免浮点累计误差与存储精度问题。
 */
export interface PriceTier {
  condition: Record<string, unknown>
  priceCents: number
}

/**
 * 流式 chat 模型的 provider usage 计费。
 * 费率为每百万 token 的整数分（CNY）。把它放在 manifest 估价阶梯旁，可避免
 * worker 在 provider 返回分离的文本/音频输入 usage 时按模型 id 分支。
 */
export interface ChatTokenUsagePricing {
  kind: 'chat_tokens'
  inputTextPriceCentsPerMillion: number
  inputAudioPriceCentsPerMillion: number
  outputTextPriceCentsPerMillion: number
}

/**
 * 完整定价规则。
 *  - unit：计费单位（见 PricingUnit）
 *  - quantityKey：引用 manifest 某个参数名，作为计费数量来源（如 imageCount / seconds）
 *  - tiers：阶梯定价，默认阶梯必须位于 tiers[0]（estimatePriceCents 的回退依赖此不变量）
 *  - currency：固定为 CNY，价格一律整数分
 */
export interface PricingRule {
  unit: PricingUnit
  quantityKey: string
  tiers: PriceTier[]
  currency: 'CNY'
  /** 当 provider usage 暴露 token 桶时的可选最终费用计算。 */
  actualUsage?: ChatTokenUsagePricing
}

/**
 * ModelManifest —— 整个系统的核心抽象。
 *
 * 一份 manifest 声明式地描述"一个 provider 模型"的全部信息。下游（API / worker /
 * provider runner / UI / 校验 / 定价）都从这一份描述派生行为，而不依赖任何硬编码：
 *  - id：稳定标识，对外出现在 URL / API / share 链接中，registry 内必须唯一
 *  - provider + providerModel：provider 名 + 调用 DashScope 时使用的真实模型名
 *  - category / taskMode / capabilities：决定 UI 分组、调用时序、暴露的输入控件
 *  - parameters：强类型参数表——name 同时是 request.bindings 与 pricing.quantityKey
 *      的引用 key
 *  - request：ProviderRequestMapping，把参数分发到 DashScope 请求体（manifest 驱动
 *      的核心，见 ParameterBinding 如何把字段落到 input.prompt / input.media /
 *      parameters.xxx 等位置）
 *  - output：ProviderOutputMapping，把 provider 响应归一化为 artifact
 *  - pricing：PricingRule，定价规则（整数分 CNY）
 *  - availability：是否对外启用、稳定度（stable / beta / hidden）
 *
 * 设计原则：manifest 是纯数据，不依赖 DB / provider runner / service。因此
 * 【添加新模型 = 新增一份 manifest 并在 MODEL_REGISTRY 注册】，provider 与 service
 * 代码无需改动。registry.ts 在加载时对每个 manifest 深冻结 + 一致性断言。
 */
export interface ModelManifest {
  id: string
  provider: ModelProvider
  providerModel: string
  displayName: string
  /** 面向用户的一句话中文介绍（创作页展示在模型名下方）。 */
  description?: string
  category: ModelCategory
  taskMode: ModelTaskMode
  capabilities: ModelCapability[]
  parameters: ModelParameter[]
  mediaGroups?: MediaParameterGroup[]
  request: ProviderRequestMapping
  output: ProviderOutputMapping
  pricing: PricingRule
  availability: {
    enabled: boolean
    stage: 'stable' | 'beta' | 'hidden'
  }
}

export interface LocalizedModelMessage {
  readonly 'zh-CN': string
  readonly 'en-US': string
}

/**
 * 单条参数校验错误。code/field 用于稳定控制流；message 保留英文兼容字段，
 * messages/expected 面向中英文 UI 与第三方调用方。
 */
export interface ParameterValidationIssue {
  code: 'REQUIRED_PARAMETER' | 'INVALID_TYPE' | 'OUT_OF_RANGE' | 'INVALID_VALUE' | 'UNKNOWN_PARAMETER'
  field: string
  message: string
  messages: LocalizedModelMessage
  expected?: LocalizedModelMessage
}

/**
 * 参数校验结果：是否通过、错误列表、合并 defaultValue 后的最终 params。
 * 下游直接拿 params 交给 provider 请求构建器，无需再二次填充默认值。
 */
export interface ValidationResult {
  valid: boolean
  errors: ParameterValidationIssue[]
  params: Record<string, unknown>
}

/**
 * 递归只读视图。MODEL_REGISTRY 在模块加载时对 manifest 深冻结（Object.freeze
 * 递归），下游通过该类型消费 manifest，因而在类型层面就杜绝了 mutate。
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/**
 * registry 对外暴露的 manifest 形态——深只读。
 * 可变的 ModelManifest 值可赋值给该类型（协变），所以调用方传两种形态都能兼容。
 */
export type FrozenModelManifest = DeepReadonly<ModelManifest>
