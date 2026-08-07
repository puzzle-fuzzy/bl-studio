/**
 * manifest 驱动的定价估算。
 *
 * 一切定价信息来自 manifest 的 PricingRule.rates（官方定价表）：计费单位
 * （unit）、计费数量字段（quantityKey）、每单位单价（rates[].unitPrice，十进制元）。
 * 本模块不含任何模型专属硬编码——新增模型只要在 manifest 里声明 rates，估价自动可用。
 *
 * 货币单位约定：【存储与返回一律整数分（CNY）】，绝非浮点元。rates[].unitPrice
 * 是官方源的十进制元字符串（可能含小数，如 '0.6'）；estimatePriceCents 的返回值
 * 【始终取整为整数分】，因为 cost_estimate / cost_final 是 integer 列、
 * GenerationRepository 的 costEstimate 也沿用整数分约定，避免浮点累计误差与存储
 * 精度问题（直接把 31.5 这样的浮点写进 integer 列会让 INSERT 报错）。
 */

import type { FrozenModelManifest, PricingRateData } from './types'

/** 默认计费区域。bl-studio 部署于 cn-beijing（china-mainland），估算只取该区。 */
const DEFAULT_REGION = 'cn-beijing'

/** 元 → 分换算。 */
const YUAN_TO_CENTS = 100

/**
 * 把 rate 换算为「每单位量的分值」。unitSize 是计费单位量（1 = 按张/按秒，
 * 1000000 = 每百万 token），所以返回的是【每张 / 每秒 / 每 token 的分值】。
 */
function rateCentsPerUnit(rate: Readonly<PricingRateData>): number {
  const yuan = Number(rate.unitPrice)
  if (!Number.isFinite(yuan)) return 0
  return (yuan * YUAN_TO_CENTS) / rate.unitSize
}

/**
 * rate.conditions 的取值形态：
 *  - 标量值（如 `{ mode: 'pro' }`）→ 与 params[key] 精确相等才算命中；
 *  - 在场谓词 `{ present: boolean }`（如 `{ featureVideo: { present: true } }`）→
 *    按媒体参数是否提供值判断（契约 hasReferenceVideo / hasAudio 等派生条件经此归一）。
 */
function isPresenceCondition(value: unknown): value is { present: boolean } {
  return typeof value === 'object'
    && value !== null
    && Object.keys(value).length === 1
    && typeof (value as { present?: unknown }).present === 'boolean'
}

function mediaPresent(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** 判断 params 是否命中某 rate 的 conditions。空 conditions 恒不命中（默认价由回退处理）。 */
function matchesConditions(rate: Readonly<PricingRateData>, params: Record<string, unknown>): boolean {
  const conditionEntries = Object.entries(rate.conditions)
  if (conditionEntries.length === 0) return false
  return conditionEntries.every(([key, value]) => {
    if (isPresenceCondition(value)) return mediaPresent(params[key]) === value.present
    return params[key] === value
  })
}

/** 默认价判定：conditions 为空对象。registry-check 强制每个 chargeItem 至多一个默认价。 */
function isDefaultRate(rate: Readonly<PricingRateData>): boolean {
  return Object.keys(rate.conditions).length === 0
}

/**
 * 保守回退（P2-20）：conditions 未命中且无默认价时，不再静默取第一条。常见档位
 * 总是声明在前，条件缺失时按最低档估价会低估费用、误导预检与日限额累加；改取池中
 * 每单位分值最高的 rate 作保守上界。正常路径（条件命中或有默认价）不受影响。
 */
function conservativeFallback(pool: readonly PricingRateData[]): PricingRateData | undefined {
  return pool.reduce<PricingRateData | undefined>(
    (best, rate) => best === undefined || rateCentsPerUnit(rate) > rateCentsPerUnit(best) ? rate : best,
    undefined,
  )
}

/**
 * 从 rates 中选取一条：先过滤 chargeItem，cn-beijing 区优先；先命中 conditions，
 * 否则回退默认价（conditions 为空），仍无匹配时取保守上界（P2-20）。
 * estimatePriceCents 的回退依赖"默认价存在"。
 */
function selectRate(
  manifest: FrozenModelManifest,
  chargeItem: PricingRateData['chargeItem'],
  params: Record<string, unknown>,
): PricingRateData | undefined {
  const candidates = manifest.pricing.rates.filter(rate => rate.chargeItem === chargeItem)
  if (candidates.length === 0) return undefined
  const pool = candidates.some(rate => rate.region === DEFAULT_REGION)
    ? candidates.filter(rate => rate.region === DEFAULT_REGION)
    : candidates
  return pool.find(candidate => matchesConditions(candidate, params))
    ?? pool.find(isDefaultRate)
    ?? conservativeFallback(pool)
}

/**
 * 从 params 中读取计费数量。缺失或非法（非有限正数）时回退为 1——按"单件"计价
 * 而不是抛错，保证估价在边界输入下仍可给出保守值。
 */
function quantityFrom(params: Record<string, unknown>, quantityKey: string): number {
  const raw = params[quantityKey]
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  return 1
}

/**
 * 按 manifest.pricing 估算总价（单位：分 CNY）。
 *
 * 取 chargeItem='output' 的 rate（视频/图像按输出量计费），先命中条件，否则回退默认价；
 * 无 output 类 rate 时回退任意 chargeItem。rateCentsPerUnit（每单位量分值，可能含小数）
 * 与 quantity 相乘得到原始费用，返回值【始终取整为整数分】（Math.round）：
 * cost_estimate / cost_final 是 integer 列，钱绝不用浮点存储。
 */
export function estimatePriceCents(manifest: FrozenModelManifest, params: Record<string, unknown>): number {
  const rate = selectRate(manifest, 'output', params)
    ?? selectRate(manifest, 'input', params)
    ?? selectRate(manifest, 'input-and-output', params)
    ?? selectRate(manifest, 'cache-read', params)
  if (!rate) return 0

  const quantity = quantityFrom(params, manifest.pricing.quantityKey)
  // input-and-output 类 chargeItem（视频编辑等）输入与输出两端各自计费，数量翻倍。
  const billableQuantity = rate.chargeItem === 'input-and-output' ? quantity * 2 : quantity
  const rawCents = rateCentsPerUnit(rate) * billableQuantity
  const rounded = Math.round(rawCents)
  // token 计费模型提交前无法预知实际用量：quantity 是请求参数上限（maxTokens）或用户
  // 费用预估代理（estimatedDuration 秒数），与 per-token 费率相乘常被取整成 0（P1-02：
  // 剧本模型 60 秒 × 0.004 分/token ≈ 0.24 分 → Math.round 成 0），既误导「约 ¥0.00」
  // 预检，也让 enforceDailyGenerationLimits 按 0 累加、架空每日成本上限。与结算口径
  // （calculateUsagePriceCents 的 Math.max(1, …)）保持一致，给 token 费率保守下限 1 分。
  return rate.unit === 'token' ? Math.max(1, rounded) : rounded
}

/**
 * 取 token 型某 chargeItem 的「每 token 分值」。优先匹配指定 conditions.mode
 * （如 qwen3.5-omni 的 audio-input），否则回退默认价。无 token rate 时返回 undefined。
 */
function tokenRateCents(
  manifest: FrozenModelManifest,
  chargeItem: PricingRateData['chargeItem'],
  mode?: string,
): number | undefined {
  const rates = manifest.pricing.rates.filter(rate => rate.unit === 'token' && rate.chargeItem === chargeItem)
  if (rates.length === 0) return undefined
  const pool = rates.some(rate => rate.region === DEFAULT_REGION)
    ? rates.filter(rate => rate.region === DEFAULT_REGION)
    : rates
  const withMode = mode !== undefined ? pool.find(rate => rate.conditions['mode'] === mode) : undefined
  const rate = withMode ?? pool.find(isDefaultRate) ?? conservativeFallback(pool)
  if (rate === undefined) return undefined
  return rateCentsPerUnit(rate)
}

/**
 * 根据 manifest 声明的 token rates 计算最终费用（按实际文本/音频 token 桶）。
 *
 * 刻意与 estimatePriceCents 分离：估价可能基于请求参数，而流式 provider 按
 * 实际文本/音频 token 桶计费。usage 未知或不完整时返回 undefined，让调用方
 * 保留 preflight 估价，而不是记录一个捏造的价格。
 *
 * token 桶 → rate 的映射：input.textTokens → input 默认（或 text-image-video-input
 * mode）rate；input.audioTokens → audio-input rate；completion.textTokens → output
 * 默认（或 multimodal-input-text-output mode）rate。深度无 mode 区分的模型
 * （deepseek 等）直接用默认 input/output rate。
 */
export function calculateUsagePriceCents(
  manifest: FrozenModelManifest,
  usage: unknown,
): number | undefined {
  if (!manifest.pricing.rates.some(rate => rate.unit === 'token')) return undefined

  const usageRecord = asRecord(usage)
  if (usageRecord === undefined) return undefined
  const promptDetails = asRecord(usageRecord.promptTokensDetails)
  const completionDetails = asRecord(usageRecord.completionTokensDetails)
  const textInputTokens = nonNegativeNumber(promptDetails?.textTokens)
    ?? nonNegativeNumber(usageRecord.promptTokens)
  const audioInputTokens = nonNegativeNumber(promptDetails?.audioTokens) ?? 0
  const outputTokens = nonNegativeNumber(completionDetails?.textTokens)
    ?? nonNegativeNumber(usageRecord.completionTokens)

  if (textInputTokens === undefined && outputTokens === undefined && audioInputTokens === 0) {
    return undefined
  }

  const inputTextCents = tokenRateCents(manifest, 'input', 'text-image-video-input')
  const inputAudioCents = tokenRateCents(manifest, 'input', 'audio-input')
  const outputCents = tokenRateCents(manifest, 'output', 'multimodal-input-text-output')
  if (inputTextCents === undefined && outputCents === undefined) return undefined

  const rawCents = (
    ((textInputTokens ?? 0) * (inputTextCents ?? 0))
    + (audioInputTokens * (inputAudioCents ?? inputTextCents ?? 0))
    + ((outputTokens ?? 0) * (outputCents ?? 0))
  )

  if (!Number.isFinite(rawCents)) return undefined
  return Math.max(1, Math.round(rawCents))
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function optionalPositiveQuantity(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** 官方口径的完整结算明细（BigInt 十进制数学，绝不用浮点做货币运算）。 */
export interface ModelUsageCostEstimate {
  readonly cents: number
  readonly currency: 'CNY'
  readonly rate: PricingRateData
  readonly inputQuantity: number
  readonly outputQuantity: number
  readonly billableQuantity: number
}

/**
 * 模型生成成本估价。source 区分「官方定价表精确结算」与「请求参数上限估算」：
 * token 计费模型提交前无法预知实际用量，只能按参数上限估算（manifest-estimate）；
 * 按时长/张数计费模型直接用官方定价结算（manifest）。
 */
export interface ModelCostEstimate {
  readonly cents: number
  readonly currency: 'CNY'
  readonly source: 'manifest' | 'manifest-estimate'
  readonly official?: ModelUsageCostEstimate
}

/** 十进制字符串（unitPrice，元）与数量相乘再换算为分，全程 BigInt，精确到分。 */
function decimalYuanToRoundedCents(unitPrice: string, quantity: number, unitSize: number): number {
  const price = decimalFraction(unitPrice)
  const amount = decimalFraction(String(quantity))
  if (price === undefined || amount === undefined || !Number.isSafeInteger(unitSize) || unitSize <= 0) {
    return Number.NaN
  }
  const numerator = price.numerator * amount.numerator * 100n
  const denominator = price.denominator * amount.denominator * BigInt(unitSize)
  const rounded = (numerator * 2n + denominator) / (denominator * 2n)
  return Number(rounded)
}

function decimalFraction(value: string): { numerator: bigint; denominator: bigint } | undefined {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value)
  if (match === null) return undefined
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  const exponent = Number(match[3] ?? '0')
  if (!Number.isSafeInteger(exponent)) return undefined
  let numerator = BigInt(`${whole}${fraction}`)
  let denominator = 10n ** BigInt(fraction.length)
  if (exponent > 0) numerator *= 10n ** BigInt(exponent)
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent)
  return { numerator, denominator }
}

/**
 * 官方口径提交前结算：选 rate、算计费数量（input-and-output 双端计费翻倍）、
 * BigInt 换算为分。与 estimatePriceCents 的差异只在精度与返回明细；不抛错，
 * 无法结算（rate 缺失 / 数量非法）时返回 undefined。
 */
function estimateOfficialCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
): ModelUsageCostEstimate | undefined {
  const rate = selectRate(manifest, 'output', params)
    ?? selectRate(manifest, 'input', params)
    ?? selectRate(manifest, 'input-and-output', params)
    ?? selectRate(manifest, 'cache-read', params)
  if (!rate) return undefined

  const inputQuantity = quantityFrom(params, manifest.pricing.quantityKey)
  const billableQuantity = rate.chargeItem === 'input-and-output' ? inputQuantity * 2 : inputQuantity
  const cents = decimalYuanToRoundedCents(rate.unitPrice, billableQuantity, rate.unitSize)
  if (!Number.isSafeInteger(cents) || cents < 0) return undefined
  return {
    cents,
    currency: 'CNY',
    rate,
    inputQuantity,
    outputQuantity: inputQuantity,
    billableQuantity,
  }
}

/**
 * 用最终响应 usage 结算实际费用（视频时长计费模型）。
 *
 * 非 input-and-output：按 usage 的输出时长结算；input-and-output（视频编辑等）：
 * 输入 + 输出双端时长计费。usage 未提供可识别数量时返回 undefined，调用方应保留
 * 提交前估价；token 计费模型走 calculateUsagePriceCents（本函数对 token rate 返回
 * undefined，由调用方衔接）。绝不用浮点做货币运算。
 */
export function calculateUsageCostCents(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
  usage: unknown,
): ModelUsageCostEstimate | undefined {
  const rate = selectRate(manifest, 'output', params)
    ?? selectRate(manifest, 'input', params)
    ?? selectRate(manifest, 'input-and-output', params)
    ?? selectRate(manifest, 'cache-read', params)
  if (!rate || rate.unit === 'token') return undefined

  const usageRecord = asRecord(usage)
  if (usageRecord === undefined) return undefined
  const outputQuantity = optionalPositiveQuantity(usageRecord.output_video_duration)
    ?? optionalPositiveQuantity(usageRecord.duration)
  if (outputQuantity === undefined) return undefined

  if (rate.chargeItem !== 'input-and-output') {
    const inputQuantity = optionalPositiveQuantity(params.duration) ?? outputQuantity
    const cents = decimalYuanToRoundedCents(rate.unitPrice, outputQuantity, rate.unitSize)
    if (!Number.isSafeInteger(cents) || cents < 0) return undefined
    return {
      cents,
      currency: 'CNY',
      rate,
      inputQuantity,
      outputQuantity,
      billableQuantity: outputQuantity,
    }
  }

  const inputQuantity = optionalPositiveQuantity(usageRecord.input_video_duration)
    ?? optionalPositiveQuantity(params.duration)
    ?? outputQuantity
  const billableQuantity = inputQuantity + outputQuantity
  const cents = decimalYuanToRoundedCents(rate.unitPrice, billableQuantity, rate.unitSize)
  if (!Number.isSafeInteger(cents) || cents < 0) return undefined
  return { cents, currency: 'CNY', rate, inputQuantity, outputQuantity, billableQuantity }
}

/**
 * 生成前成本估算（提交前预检）。
 *
 * token 计费模型（对话/流式多模态）提交前无法预知实际用量，按请求参数上限估算
 * （estimatePriceCents）；按时长/张数计费模型走官方 BigInt 精确结算。两种情况都
 * 不抛错——params 缺数量时保守回退，让预检在边界输入下仍可给出估值。
 */
export function estimateModelCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
): ModelCostEstimate {
  if (manifest.pricing.rates.some(rate => rate.unit === 'token')) {
    return { cents: estimatePriceCents(manifest, params), currency: 'CNY', source: 'manifest-estimate' }
  }
  const official = estimateOfficialCost(manifest, params)
  if (official === undefined) {
    return { cents: estimatePriceCents(manifest, params), currency: 'CNY', source: 'manifest-estimate' }
  }
  return { cents: official.cents, currency: 'CNY', source: 'manifest', official }
}
