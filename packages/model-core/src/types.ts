/**
 * manifest 驱动架构的核心类型定义。
 *
 * 整个 Bailian Studio 系统对"一个 provider 模型"的全部认知，都来自 ModelManifest 这一份
 * 声明式描述：能力（capabilities）、强类型参数（parameters）、如何把参数分发到
 * provider 请求体（ProviderRequestMapping 的 ParameterBinding bindings，决定字段
 * 落到 input.prompt / input.media / parameters.xxx 等哪个位置）、如何把 provider
 * 响应归一化为 artifact（ProviderOutputMapping）、定价（PricingRule）、以及 provider
 * 传输契约（ProviderTransport：提交/轮询端点、状态值、请求头）与跨字段校验规则
 * （ModelValidationRule）。
 *
 * 设计意图：把"模型知识"从"调用 provider 的代码"中彻底抽离。DashScope provider 包
 * 的 buildDashScopeRequest 读取 manifest 的 bindings 决定每个字段落到请求体的哪个
 * 位置；transport 决定提交到哪个端点、如何轮询任务状态；rules 承载 provider 的
 * 跨字段约束。因此【添加一个新模型参数 = 在 manifest 中新增一条 ParameterBinding】、
 * 【新增一个新模型 = 新增一份 manifest 条目并注册】、【官网文档变更 = 改 manifest
 * 数据】，provider 代码无需改动。
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
 * 这是独立于 pricing 条件的产品表单语义，不能复用价格条件。
 */
export interface ParameterVisibilityRule {
  field: string
  equals: unknown
}

/**
 * 条件约束的触发条件：字段等于某值（exclusive），或媒体字段「在场 / 缺席」。
 * 对应 provider 契约的 field-value-when 语义（如 wan2.7-r2v：含参考视频时
 * duration 上限降为 10）。field 一律指 manifest 参数名。
 */
export type ParameterWhen =
  | { field: string; present: boolean }
  | { field: string; equals: unknown }

/**
 * 参数的条件约束：仅当 when 命中时，以 min/max/equals 覆盖参数的静态约束。
 *  - max：条件命中时的数值上界（如 wan2.7-r2v duration 含参考视频时 max:10）
 *  - equals：条件命中时的强制取值（如 kling：含 feature 视频时 audio 必须为 false）
 * 运行时校验顺序：静态约束不通过即报错；条件命中时再校验条件约束。
 */
export interface ParameterConditionalConstraint {
  min?: number
  max?: number
  equals?: unknown
  when: ParameterWhen
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
  /** 条件约束：when 命中时以 min/max/equals 覆盖静态约束（见 ParameterWhen）。 */
  conditional?: ParameterConditionalConstraint
  /**
   * 仅对 `type: 'media'` 参数有意义：声明该输入期望的媒体种类（image / video /
   * audio / text）。前端「作品库」选择器据此过滤候选成品，避免把图像参数配上视频、
   * 或把音频参数配上图像。非 media 类型参数应留空。
   */
  mediaKind?: ModelCategory
}

/**
 * 跨字段校验规则的触发条件。field 一律指 manifest 参数名（params 键），
 * 运行时作用于合并 defaultValue 后的 params。
 *  - field-equals：字段等于 equals（negate 取反时为其反面）
 *  - media-count：media 参数的条目数满足范围（对应契约 array-item-count 条件）
 */
export type ModelRuleCondition =
  | { kind: 'field-equals'; field: string; equals: unknown; negate?: boolean }
  | { kind: 'media-count'; field: string; minimum?: number; maximum?: number }

/**
 * 跨字段校验规则 —— 由 provider 契约 rules[] 与旧 mediaGroups 统一而来。
 *
 * field 一律指 manifest 参数名。运行时在 validateModelParams 中评估：先做
 * 参数级静态校验（required/type/range），再评估这些跨字段规则。code/message
 * 来自官方契约（源码措辞保留），media-group 缺省时由校验器生成默认文案。
 */
export type ModelValidationRule =
  | {
      /** 至少提供 fields 中之一（契约 required-one-of，如 fun-music 的 lyrics/prompt）。 */
      kind: 'required-one-of'
      fields: string[]
      /** 至少命中数量，缺省 1。 */
      minimum?: number
      code: string
      message: LocalizedModelMessage
    }
  | {
      /** 文本长度约束，区分中文字符与非中文字符（契约 text-length）。 */
      kind: 'text-length'
      field: string
      /** 中文字符数限制。 */
      cjk: { min?: number; max: number }
      /** 非中文字符数限制。 */
      other: { min?: number; max: number }
      /** 仅在该传输模式下生效（契约 modes，如 fun-music 的流式/非流式区分）。缺省 = 全部模式。 */
      modes?: ModelTaskMode[]
      code: string
      message: LocalizedModelMessage
    }
  | {
      /** condition 命中时 field 必须提供（契约 field-required-when）。 */
      kind: 'field-required-when'
      field: string
      condition: ModelRuleCondition
      code: string
      message: LocalizedModelMessage
    }
  | {
      /** condition 命中时 field 不得设置（契约 field-allowed-when）。 */
      kind: 'field-allowed-when'
      field: string
      condition: ModelRuleCondition
      code: string
      message: LocalizedModelMessage
    }
  | {
      /** 共享同一数量上/下界的媒体参数组（由 mediaGroups 与契约 collection-sum-max 统一）。 */
      kind: 'media-group'
      fields: string[]
      minItems?: number
      maxItems?: number
      /** 条件命中时该组约束才生效。 */
      condition?: ModelRuleCondition
      code?: string
      message?: LocalizedModelMessage
    }
  | {
      /** 数组内每个条目的某字段不得超过另一参数（契约 array-item-field-max-path）。 */
      kind: 'array-item-field-max-path'
      field: string
      /** 数组条目上受约束的字段名。 */
      itemProperty: string
      /** 上限来源的参数名。 */
      maximumField: string
      /** maximumField 未提供时的默认上限。 */
      defaultMaximum: number
      code: string
      message: LocalizedModelMessage
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

/** 定价计费单位：按图 / 按秒（视频时长）/ 按 token（文本）。 */
export type PricingUnit = 'per_image' | 'per_second' | 'per_token'

/**
 * 官方定价表条目（由 bailian-hub 契约 pricing.rates 并入，唯一定价来源）。
 *
 * unitPrice 是【十进制元字符串】（如 '0.6'、'0.00022'），保留官方源的精确形式，
 * 避免浮点误差；估算时按单位量换算成整数分（CNY）。conditions 为空对象表示
 * 默认价，非空时需与参数值精确匹配才命中该条（如 {resolution: '1080P'}）。
 */
export interface PricingRateData {
  id: string
  /** 计费区域（如 cn-beijing）。bl-studio 实际只用 cn-beijing，保留以对照官方源。 */
  region: string
  serviceScope: 'china-mainland' | 'international' | 'global'
  /** 计费项目：输入 / 输出 / 输入输出合计 / 缓存读取。 */
  chargeItem: 'input' | 'output' | 'input-and-output' | 'cache-read'
  /** 计费粒度：每张图 / 每秒 / 每 token。 */
  unit: 'image' | 'second' | 'token'
  /** 计费单位量：1（按张/按秒）或 1000000（每百万 token）。 */
  unitSize: number
  /** 单价，十进制元字符串（官方源精确形式）。 */
  unitPrice: string
  /** 阶梯条件：非空时需与参数值精确匹配才命中（如 {resolution: '1080P'}）；空对象 = 默认价。 */
  conditions: Record<string, unknown>
}

/**
 * 完整定价规则。
 *  - unit：计费单位（见 PricingUnit），声明 quantityKey 的度量语义
 *  - quantityKey：引用 manifest 某个参数名，作为计费数量来源（如 imageCount / duration）
 *  - rates：官方定价表，首个 conditions 为空的条目为默认价（estimatePriceCents 的回退依赖此不变量）
 *  - currency：固定为 CNY，价格一律整数分
 *
 * 文本模型的按 token 单价、输入音频/输出文本等区分，均由 rates 的 unitSize 与
 * conditions 表达，运行时从 rates 推导（不再有独立 actualUsage 结构）。
 */
export interface PricingRule {
  unit: PricingUnit
  quantityKey: string
  rates: PricingRateData[]
  currency: 'CNY'
}

/**
 * provider 传输契约 —— 提交/轮询/流式端点与请求头。
 *
 * 由 bailian-hub 契约 transports[] 并入，是"如何调用 provider"的唯一来源。
 * endpointTemplate 使用 `{WorkspaceId}` 占位符，运行时按工作区 ID 替换。
 * 请求头中 value 缺省表示由运行时注入（如 Authorization 签名头）。
 */
export interface ProviderTransportHeader {
  name: string
  /** 固定值（如 Content-Type: application/json、X-DashScope-Async: enable）；缺省 = 运行时注入。 */
  value?: string
}

/** 异步任务提交端点。 */
export interface ProviderSubmitTransport {
  method: 'POST'
  /** 完整端点模板（含协议与 {WorkspaceId} 占位符），运行时解析为实际 URL。 */
  endpointTemplate: string
  /** 请求体中模型名的 JSON pointer（DashScope 各模型均为 /model）。 */
  modelFieldPath: string
  headers: ProviderTransportHeader[]
}

/** 异步任务轮询端点。 */
export interface ProviderPollingTransport {
  method: 'GET'
  endpointTemplate: string
  headers: ProviderTransportHeader[]
  /** 提交响应中任务 ID 的 JSON pointer。 */
  taskIdPath: string
  /** 轮询响应中任务状态的 JSON pointer。 */
  statusPath: string
  /** 判定任务成功的状态值集合。 */
  succeededValues: string[]
  /** 判定任务失败的状态值集合。 */
  failedValues: string[]
}

/** 流式响应的传输形态。 */
export interface ProviderStreamingTransport {
  /** 期望的响应 Content-Type。 */
  contentTypes: string[]
  framing: 'sse'
  /** 流式请求头（如 X-DashScope-SSE: enable）。 */
  headers: ProviderTransportHeader[]
}

/**
 * provider 传输契约。mode 与 manifest.taskMode 对齐（registry-check 强制一致）；
 * sync 模型可额外声明 stream 段表示支持流式输出。
 */
export type ProviderTransport =
  | { mode: 'provider_async'; submit: ProviderSubmitTransport; polling: ProviderPollingTransport }
  | { mode: 'sync'; submit: ProviderSubmitTransport; stream?: ProviderStreamingTransport }
  | { mode: 'stream'; submit: ProviderSubmitTransport; stream: ProviderStreamingTransport }

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
 *  - pricing：PricingRule，定价规则（官方 rates，整数分 CNY）
 *  - transport：ProviderTransport，提交/轮询/流式端点与请求头
 *  - rules：跨字段校验规则（media 数量组、条件必填、文本长度等），可选
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
  /** 跨字段校验规则（media 数量组 / 条件必填 / 文本长度等）。 */
  rules?: ModelValidationRule[]
  request: ProviderRequestMapping
  output: ProviderOutputMapping
  pricing: PricingRule
  /** provider 传输契约：提交/轮询端点、状态值、请求头。 */
  transport: ProviderTransport
  availability: {
    enabled: boolean
    stage: 'stable' | 'beta' | 'hidden'
    /**
     * 未开通原因（如「暂未开通」）。设置后模型仍在 catalog 可见（前端置灰展示），
     * 但 enabled 必须为 false：不进入 listModels/getModelById，后端拒绝提交。
     */
    notActivated?: string
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
 * validateModelParams 可接受的 manifest 投影 —— 只需参数表、可选跨字段规则与
 * 调用时序。FrozenModelManifest 满足该形状；前端持有的 api-client catalog 投影
 * （ModelCatalogItem）也满足，因此 web 表单可以把它直接交给 model-core 做提交前
 * 实时校验，无需构造完整的 manifest。
 */
export interface ParametersValidationInput {
  id: string
  readonly parameters: readonly DeepReadonly<ModelParameter>[]
  readonly rules?: readonly DeepReadonly<ModelValidationRule>[]
  readonly taskMode: ModelTaskMode
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
