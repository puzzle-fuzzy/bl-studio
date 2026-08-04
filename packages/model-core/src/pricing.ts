/**
 * manifest 驱动的定价估算。
 *
 * 一切定价信息来自 manifest 的 PricingRule：单位（per_image / per_second /
 * per_token / per_audio）、计费数量字段（quantityKey）、阶梯定价（tiers）。
 * 本模块不含任何模型专属硬编码——新增模型只要在 manifest 里声明 PricingRule，
 * 估价自动可用。
 *
 * 货币单位约定：【存储与返回一律整数分（CNY）】，绝非浮点元。PricingRule.tiers[].priceCents
 * 是「每单位费率」，可以为小数（例如 per_second 的 0.5 分/秒、per_token 的每百万 token 多少分）；
 * 但 estimatePriceCents 的返回值【始终取整为整数分】，因为 cost_estimate / cost_final 是
 * integer 列、GenerationRepository 的 costEstimate 也沿用整数分约定，避免浮点累计误差与存储
 * 精度问题（直接把 31.5 这样的浮点写进 integer 列会让 INSERT 报错）。
 */

import type { FrozenModelManifest, PriceTier } from './types'

/**
 * 判断 params 是否命中某阶梯的 condition。
 *
 * 故意对空 condition 返回 false：空 condition 的 tier 是"默认阶梯"（见
 * registry-check.ts 强制要求 tiers[0] 为默认），其语义是"无其他阶梯命中时的
 * 回退"，由 estimatePriceCents 用 `?? tiers[0]` 单独处理，不应被这里视作命中。
 */
function matchesTier(tier: PriceTier, params: Record<string, unknown>): boolean {
  const conditionEntries = Object.entries(tier.condition)
  if (conditionEntries.length === 0) return false
  return conditionEntries.every(([key, value]) => params[key] === value)
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
 * 阶梯匹配规则：取首个 condition 命中的 tier，若都不命中则回退到 tiers[0]
 * （默认阶梯）。tier.priceCents（每单位费率，可能是小数）与 quantity 相乘得到原始费用。
 *
 * per_token 特例：单 token 价格不足 1 分，manifest 里 per_token 阶梯的 priceCents
 * 表达的是【每 1,000,000 token 多少分】，quantity 是原始 token 数，这里除以 1_000_000
 * 还原成真实分。其他单位（per_image / per_second / per_audio）直接相乘即可。
 *
 * 返回值【始终取整为整数分】（Math.round）：cost_estimate / cost_final 是 integer 列，
 * 钱绝不用浮点存储。例如 per_second 0.5 分/秒 × 63 秒 = 31.5 → 取整为 32。
 */
export function estimatePriceCents(manifest: FrozenModelManifest, params: Record<string, unknown>): number {
  const matchingTier = manifest.pricing.tiers.find(candidate => matchesTier(candidate, params))
  const tier = matchingTier ?? manifest.pricing.tiers[0]

  if (!tier) return 0

  const quantity = quantityFrom(params, manifest.pricing.quantityKey)

  const rawCents = manifest.pricing.unit === 'per_token'
    ? (tier.priceCents * quantity) / 1_000_000
    : tier.priceCents * quantity

  return Math.round(rawCents)
}

/**
 * Calculate a final cost from provider usage declared by the manifest.
 *
 * This is intentionally separate from estimatePriceCents: an estimate may be
 * based on an input duration while a streaming provider bills actual text and
 * audio token buckets. Unknown or incomplete usage returns undefined so the
 * caller can retain the preflight estimate instead of recording a fabricated
 * price.
 */
export function calculateUsagePriceCents(
  manifest: FrozenModelManifest,
  usage: unknown,
): number | undefined {
  const pricing = manifest.pricing.actualUsage
  if (pricing?.kind !== 'chat_tokens') return undefined

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

  const rawCents = (
    ((textInputTokens ?? 0) * pricing.inputTextPriceCentsPerMillion)
    + (audioInputTokens * pricing.inputAudioPriceCentsPerMillion)
    + ((outputTokens ?? 0) * pricing.outputTextPriceCentsPerMillion)
  ) / 1_000_000

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
