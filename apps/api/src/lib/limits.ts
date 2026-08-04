export interface GenerationLimits {
  dailyTaskLimit?: number
  dailyCostLimitCents?: number
  dailyQuotaMode: 'attempts' | 'successful'
}

/**
 * 按需读取限额，使测试和本地开发无需重建 API 模块即可修改 process.env。
 * `0` 表示禁用；正整数为按用户 UTC 日的硬限额。
 */
export function readGenerationLimits(source: Readonly<Record<string, string | undefined>> = process.env): GenerationLimits {
  return {
    dailyTaskLimit: optionalLimit(source['GENERATION_DAILY_TASK_LIMIT'], 'GENERATION_DAILY_TASK_LIMIT'),
    dailyCostLimitCents: optionalLimit(source['GENERATION_DAILY_COST_LIMIT_CENTS'], 'GENERATION_DAILY_COST_LIMIT_CENTS'),
    dailyQuotaMode: source['GENERATION_DAILY_QUOTA_MODE'] === 'successful' ? 'successful' : 'attempts',
  }
}

function optionalLimit(value: string | undefined, name: string): number | undefined {
  const normalized = value?.trim()
  if (normalized === undefined || normalized.length === 0 || normalized === '0') return undefined

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer / ${name} 必须是非负整数`)
  }
  return parsed
}
