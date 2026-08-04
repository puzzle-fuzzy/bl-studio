/**
 * task 重试退避策略：纯函数化的指数退避计算。
 *
 * 与 state-machine 解耦——本模块只决定"下一次最早可运行的时刻"，
 * 是否真的进入重试由 state-machine 的 retry 分支依据 retriable 与
 * attempts < maxAttempts 判定。所有函数为纯函数，便于单测覆盖。
 */

export interface RetryBackoffOptions {
  baseMs: number
  maxMs: number
}

/** 默认退避参数：1s 起、最长 30s 封顶。 */
const DEFAULT_RETRY_BACKOFF_OPTIONS: RetryBackoffOptions = {
  baseMs: 1000,
  maxMs: 30000,
}

/**
 * 计算第 attempt 次重试需要等待的毫秒数。
 *
 * 策略：以 baseMs 为底、按 2 的幂次做指数退避（attempt=1 → baseMs，
 * attempt=2 → 2*baseMs，attempt=3 → 4*baseMs，依此类推），并以 maxMs
 * 封顶，避免长重试链把下次执行推得过远而无法及时恢复。Math.max(0, attempt-1)
 * 用于在 attempt<=0 时退化为 0 次幂，防止出现 2 的负次幂导致延迟变小数。
 */
export function calculateRetryDelayMs(
  attempt: number,
  options: RetryBackoffOptions = DEFAULT_RETRY_BACKOFF_OPTIONS,
): number {
  const exponentialDelay = options.baseMs * 2 ** Math.max(0, attempt - 1)
  return Math.min(exponentialDelay, options.maxMs)
}

/**
 * 给定当前时刻 now（ISO 字符串）和第 attempt 次重试，返回下一次可运行的
 * ISO 时刻（now + 退避毫秒数）。
 *
 * 这里把"读时钟"这件事推给调用方注入（now 形参），是为了让 state-machine
 * 的重试转换在测试里可以做到完全确定；生产侧由仓库层传入真实当前时间。
 */
export function nextRunAt(
  now: string,
  attempt: number,
  options?: RetryBackoffOptions,
): string {
  return new Date(Date.parse(now) + calculateRetryDelayMs(attempt, options)).toISOString()
}
