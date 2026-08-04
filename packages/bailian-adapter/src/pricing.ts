import {
  bailian,
  type PricingRate,
  type PricingRateFilters,
  type SupportedLocale,
} from '@puzzle-fuzzy/bailian-sdk'
import {
  estimatePriceCents,
  type FrozenModelManifest,
} from '@bailian-studio/model-core'
import { getBailianIntegrationStatus, requireCoveredRequirement } from './coverage'
import { BailianStudioBailianAdapterError, coverageDriftError } from './errors'

export interface OfficialBailianCostEstimate {
  readonly cents: number
  readonly currency: 'CNY'
  readonly rate: PricingRate
  readonly inputQuantity: number
  readonly outputQuantity: number
  readonly billableQuantity: number
}

export interface BailianModelCostEstimate {
  readonly cents: number
  readonly currency: 'CNY'
  readonly source: 'sdk' | 'manifest-estimate' | 'legacy-manifest'
  readonly official?: OfficialBailianCostEstimate
}

export function listOfficialBailianPricing(
  consumerId: string,
  filters: PricingRateFilters = {},
  locale: SupportedLocale = 'zh-CN',
): PricingRate[] {
  const requirement = requireCoveredRequirement(consumerId, locale)
  return bailian.models.pricing(requirement.providerModelId, {
    ...filters,
    region: filters.region ?? requirement.region,
  })
}

export function estimateBailianModelCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
  locale: SupportedLocale = 'zh-CN',
): BailianModelCostEstimate {
  if (getBailianIntegrationStatus(manifest.id).kind === 'legacy') {
    return {
      cents: estimatePriceCents(manifest, params),
      currency: 'CNY',
      source: 'legacy-manifest',
    }
  }

  // 流式多模态模型只在响应完成后才暴露精确 token 用量。其预检估价仍按时长估算；
  // 最终计费仍以官方 usage 费率计算。
  if (manifest.pricing.actualUsage !== undefined) {
    return {
      cents: estimatePriceCents(manifest, params),
      currency: 'CNY',
      source: 'manifest-estimate',
    }
  }

  const official = estimateOfficialBailianCost(manifest.id, params, locale)
  return { cents: official.cents, currency: 'CNY', source: 'sdk', official }
}

/** 使用请求参数估算官方价格；不使用二进制浮点做货币运算。 */
export function estimateOfficialBailianCost(
  consumerId: string,
  params: Readonly<Record<string, unknown>>,
  locale: SupportedLocale = 'zh-CN',
): OfficialBailianCostEstimate {
  const rate = resolveOfficialRate(consumerId, params, locale)
  const inputQuantity = resolvePricingQuantity(consumerId, rate, params, locale)
  const billableQuantity = rate.chargeItem === 'input-and-output'
    ? inputQuantity * 2
    : inputQuantity
  return createCostEstimate(
    consumerId,
    rate,
    inputQuantity,
    inputQuantity,
    billableQuantity,
    locale,
  )
}

/**
 * 用最终响应 usage 计算实际价格。usage 未提供可识别数量时返回 undefined，调用方
 * 应保留提交前估价；存在数量但非法时则抛错，避免把坏账静默写入数据库。
 */
export function calculateOfficialBailianUsageCost(
  consumerId: string,
  params: Readonly<Record<string, unknown>>,
  usage: unknown,
  locale: SupportedLocale = 'zh-CN',
): OfficialBailianCostEstimate | undefined {
  const rate = resolveOfficialRate(consumerId, params, locale)
  const usageRecord = asRecord(usage)
  if (usageRecord === undefined) return undefined

  const outputQuantity = optionalPositiveQuantity(usageRecord.output_video_duration)
    ?? optionalPositiveQuantity(usageRecord.duration)
  if (outputQuantity === undefined) return undefined

  if (rate.chargeItem !== 'input-and-output') {
    const inputQuantity = optionalPositiveQuantity(params.duration) ?? outputQuantity
    return createCostEstimate(
      consumerId,
      rate,
      inputQuantity,
      outputQuantity,
      outputQuantity,
      locale,
    )
  }

  const inputQuantity = optionalPositiveQuantity(usageRecord.input_video_duration)
    ?? optionalPositiveQuantity(params.duration)
    ?? outputQuantity
  const billableQuantity = inputQuantity + outputQuantity
  return createCostEstimate(
    consumerId,
    rate,
    inputQuantity,
    outputQuantity,
    billableQuantity,
    locale,
  )
}

function resolveOfficialRate(
  consumerId: string,
  params: Readonly<Record<string, unknown>>,
  locale: SupportedLocale,
): PricingRate {
  const rates = listOfficialBailianPricing(consumerId, {}, locale)
  const context = pricingConditionContext(consumerId, params)
  const candidates = rates.some((rate) => rate.unit === 'token')
    ? rates.filter((rate) => rate.chargeItem === 'output')
    : rates
  const matchingRates = candidates.filter((rate) => Object.entries(rate.conditions)
    .every(([key, expected]) => pricingConditionMatches(key, expected, context)))

  if (matchingRates.length === 0) {
    throw new BailianStudioBailianAdapterError(
      'PRICING_RATE_NOT_FOUND',
      {
        'zh-CN': `业务模型 ${consumerId} 的参数无法匹配唯一的百炼官方价格`,
        'en-US': `Parameters for consumer model ${consumerId} do not match an official Bailian price`,
      },
      locale,
      { consumerId, context, availableRateIds: rates.map((rate) => rate.id) },
    )
  }
  if (matchingRates.length > 1) {
    throw new BailianStudioBailianAdapterError(
      'PRICING_RATE_AMBIGUOUS',
      {
        'zh-CN': `业务模型 ${consumerId} 的参数匹配到多个百炼官方价格`,
        'en-US': `Parameters for consumer model ${consumerId} match multiple official Bailian prices`,
      },
      locale,
      { consumerId, context, matchingRateIds: matchingRates.map((rate) => rate.id) },
    )
  }

  const rate = matchingRates[0]
  if (rate === undefined) throw coverageDriftError(`Pricing match disappeared for ${consumerId}`)
  return rate
}

function createCostEstimate(
  consumerId: string,
  rate: PricingRate,
  inputQuantity: number,
  outputQuantity: number,
  billableQuantity: number,
  locale: SupportedLocale,
): OfficialBailianCostEstimate {
  const cents = decimalYuanToRoundedCents(rate.unitPrice, billableQuantity, rate.unitSize)
  if (!Number.isSafeInteger(cents)) {
    throw new BailianStudioBailianAdapterError(
      'PRICING_OVERFLOW',
      {
        'zh-CN': `业务模型 ${consumerId} 的估价超出安全整数范围`,
        'en-US': `The estimate for consumer model ${consumerId} exceeds the safe integer range`,
      },
      locale,
      { consumerId, rateId: rate.id, billableQuantity },
    )
  }
  return { cents, currency: 'CNY', rate, inputQuantity, outputQuantity, billableQuantity }
}

function resolvePricingQuantity(
  consumerId: string,
  rate: PricingRate,
  params: Readonly<Record<string, unknown>>,
  locale: SupportedLocale,
): number {
  const value = rate.unit === 'image'
    ? params.n ?? 1
    : rate.unit === 'second'
      ? params.duration ?? params.estimatedDuration
      : rate.unit === 'token'
        ? params.maxCompletionTokens ?? params.maxTokens
        : undefined
  const quantity = optionalPositiveQuantity(value)
  if (quantity !== undefined) return quantity
  throw new BailianStudioBailianAdapterError(
    'PRICING_QUANTITY_INVALID',
    {
      'zh-CN': `业务模型 ${consumerId} 需要正数 ${rate.unit} 计费数量才能估价`,
      'en-US': `Consumer model ${consumerId} requires a positive ${rate.unit} quantity for estimation`,
    },
    locale,
    { consumerId, rateId: rate.id, unit: rate.unit, quantity: value },
  )
}

function optionalPositiveQuantity(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function pricingConditionContext(
  consumerId: string,
  params: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const mode = params.mode
  const resolution = params.resolution
    ?? (mode === 'std' ? '720P' : mode === 'pro' ? '1080P' : undefined)
    ?? resolutionFromSize(params.size)
  const hasReferenceVideo = consumerId === 'keling-video-edit'
    || (consumerId === 'keling-reference-video' && hasValue(params.featureVideo))

  return {
    mode: mode ?? (params.enableThinking === true ? 'thinking' : 'non-thinking'),
    resolution,
    aspectRatio: params.aspectRatio ?? params.ratio,
    hasAudio: params.audio === true,
    hasReferenceVideo,
    promptExtend: params.promptExtend,
    inputTokens: estimateInputTokens(params.prompt),
  }
}

function pricingConditionMatches(
  key: string,
  expected: unknown,
  context: Readonly<Record<string, unknown>>,
): boolean {
  if (key !== 'inputTokenRange') return context[key] === expected
  const range = asRecord(expected)
  const inputTokens = context.inputTokens
  if (range === undefined || typeof inputTokens !== 'number') return false
  const minimum = range.minimum
  const maximum = range.maximum
  return (typeof minimum !== 'number' || inputTokens >= minimum)
    && (typeof maximum !== 'number' || inputTokens <= maximum)
}

function resolutionFromSize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+)\*(\d+)$/.exec(value)
  if (match === null) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  const shortEdge = Math.min(width, height)
  return [360, 480, 540, 720, 1080].includes(shortEdge) ? `${shortEdge}P` : undefined
}

function estimateInputTokens(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return 1
  return Math.max(1, Math.ceil(Array.from(value).length / 2))
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  return !Array.isArray(value) || value.length > 0
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

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
