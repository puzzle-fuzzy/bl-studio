/**
 * 纯 provider/model 降级策略。
 *
 * 本包刻意不依赖数据库、HTTP、worker 或 app。运行时 adapter 负责持久化，
 * 以持久化记录调用本策略。保持状态转换的纯粹性，使 half-open 行为与
 * cooldown 边界在测试中可确定。
 */

export type ProviderModelHealthStatus = 'healthy' | 'degraded'

export interface ProviderModelHealth {
  provider: string
  model: string
  status: ProviderModelHealthStatus
  consecutiveFailures: number
  totalFailures: number
  totalSuccesses: number
  degradedUntil: number | null
  lastFailureAt: number | null
  lastSuccessAt: number | null
  lastErrorMessage: string | null
  degradedReason: string | null
  updatedAt: number
}

export interface DegradationConfig {
  failureThreshold: number
  cooldownMs: number
}

export const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  failureThreshold: 3,
  cooldownMs: 2 * 60 * 1000,
}

export function resolveDegradationConfig(
  env: Record<string, string | undefined> = {},
): DegradationConfig {
  const failureThreshold = Number.parseInt(env.PROVIDER_DEGRADATION_FAILURE_THRESHOLD ?? '', 10)
  const cooldownMs = Number.parseInt(env.PROVIDER_DEGRADATION_COOLDOWN_MS ?? '', 10)

  return {
    failureThreshold: Number.isInteger(failureThreshold) && failureThreshold > 0
      ? failureThreshold
      : DEFAULT_DEGRADATION_CONFIG.failureThreshold,
    cooldownMs: Number.isInteger(cooldownMs) && cooldownMs > 0
      ? cooldownMs
      : DEFAULT_DEGRADATION_CONFIG.cooldownMs,
  }
}

export interface ProviderOutcome {
  provider: string
  model: string
  success: boolean
  errorMessage?: string
  ts: number
}

export interface ApplyOutcomeResult {
  record: ProviderModelHealth
  transitionedTo?: ProviderModelHealthStatus
}

export function freshProviderModelHealth(
  provider: string,
  model: string,
  ts: number,
): ProviderModelHealth {
  return {
    provider,
    model,
    status: 'healthy',
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    degradedUntil: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastErrorMessage: null,
    degradedReason: null,
    updatedAt: ts,
  }
}

/**
 * 仅在冷却期拦截调用时返回 true。冷却过期后，下一个调用方作为 half-open 探测请求放行。
 */
export function isDegraded(record: ProviderModelHealth | null, now: number): boolean {
  return record?.status === 'degraded'
    && record.degradedUntil !== null
    && now < record.degradedUntil
}

export function degradedRemainingMs(record: ProviderModelHealth | null, now: number): number {
  if (!isDegraded(record, now) || record?.degradedUntil === null || record?.degradedUntil === undefined)
    return 0
  return Math.max(0, record.degradedUntil - now)
}

/**
 * 计算一次不可变的状态转换。冷却期间反复失败不会延长冷却窗口；
 * 冷却过期后的失败会重新打开窗口。
 */
export function applyProviderOutcome(
  state: ProviderModelHealth | null,
  outcome: ProviderOutcome,
  config: DegradationConfig = DEFAULT_DEGRADATION_CONFIG,
): ApplyOutcomeResult {
  const previous = state ?? freshProviderModelHealth(outcome.provider, outcome.model, outcome.ts)

  if (outcome.success) {
    const recovered = previous.status === 'degraded'
    return {
      record: {
        ...previous,
        provider: outcome.provider,
        model: outcome.model,
        status: 'healthy',
        consecutiveFailures: 0,
        totalSuccesses: previous.totalSuccesses + 1,
        degradedUntil: null,
        degradedReason: null,
        lastSuccessAt: outcome.ts,
        updatedAt: outcome.ts,
      },
      ...(recovered ? { transitionedTo: 'healthy' as const } : {}),
    }
  }

  const consecutiveFailures = previous.consecutiveFailures + 1
  const wasBlocking = isDegraded(previous, outcome.ts)
  const reachesThreshold = consecutiveFailures >= config.failureThreshold
  let status: ProviderModelHealthStatus = previous.status
  let degradedUntil = previous.degradedUntil
  let degradedReason = previous.degradedReason
  let transitionedTo: ProviderModelHealthStatus | undefined

  if (reachesThreshold) {
    status = 'degraded'
    if (!wasBlocking) {
      degradedUntil = outcome.ts + config.cooldownMs
      degradedReason = `consecutive provider failures: ${consecutiveFailures}`
      transitionedTo = 'degraded'
    }
  }
  else {
    status = 'healthy'
    degradedUntil = null
    degradedReason = null
  }

  return {
    record: {
      ...previous,
      provider: outcome.provider,
      model: outcome.model,
      status,
      consecutiveFailures,
      totalFailures: previous.totalFailures + 1,
      degradedUntil,
      degradedReason,
      lastFailureAt: outcome.ts,
      lastErrorMessage: outcome.errorMessage ?? previous.lastErrorMessage,
      updatedAt: outcome.ts,
    },
    ...(transitionedTo ? { transitionedTo } : {}),
  }
}
