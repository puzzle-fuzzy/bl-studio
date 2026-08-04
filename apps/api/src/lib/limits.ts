export interface GenerationLimits {
  dailyTaskLimit?: number
  dailyCostLimitCents?: number
  dailyQuotaMode: 'attempts' | 'successful'
}

/**
 * Read limits on demand so tests and local development can change process.env
 * without rebuilding the API module. `0` means disabled; positive integers are
 * hard per-user UTC-day limits.
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
