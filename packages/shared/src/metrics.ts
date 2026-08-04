/**
 * 进程内微型指标采集器，用于请求/操作的可观测性。
 *
 * Counter 累计发生次数；Timing 维护 count + sum + min + max，因此可派生平均值。
 * 每个指标以「name + tag 签名」作为复合 key，因此
 * `increment('api.request', { status: '200' })` 与
 * `increment('api.request', { status: '500' })` 是两条独立序列。
 *
 * 存储为内存态（进程重启即丢失），足以把运行时行为暴露给日志或 snapshot 端点；
 * 生产环境若需持久化，应将 `snapshot()` 转发到外部指标后端（如 Prometheus）。
 */

/** 单个 timing 序列的汇总：次数、总耗时、最小/最大耗时（可派生平均值）。 */
export interface TimerSummary {
  count: number
  sumMs: number
  minMs: number
  maxMs: number
}

/** 一次 snapshot 的快照结构：所有 counter 当前值与所有 timer 的汇总。 */
export interface MetricsSnapshot {
  counters: Record<string, number>
  timers: Record<string, TimerSummary>
}

/**
 * 把 tag 字典规范化为稳定的字符串签名：键排序后以 `k=v` 拼接。
 * 排序是为了保证 `{a:1,b:2}` 与 `{b:2,a:1}` 命中同一序列——否则调用顺序差异会
 * 制造出无意义的独立序列，污染聚合数据。
 */
function tagKey(tags?: Record<string, string | number>): string {
  if (tags === undefined) return ''
  return Object.keys(tags).sort().map(key => `${key}=${tags[key]}`).join(',')
}

export class MetricsCollector {
  private readonly counters = new Map<string, number>()
  private readonly timers = new Map<string, { count: number; sum: number; min: number; max: number }>()

  /** 累加某个 counter（默认 +1）；同一 name + tag 签名视为同一序列。 */
  increment(name: string, tags?: Record<string, string | number>, value = 1): void {
    const key = `${name}|${tagKey(tags)}`
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  /**
   * 记录一次耗时样本。忽略 NaN / Infinity / 负值，防止脏数据污染 min/max/sum；
   * 已有序列则增量更新 count/sum/min/max，新序列则初始化为该样本。
   */
  timing(name: string, milliseconds: number, tags?: Record<string, string | number>): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return
    const key = `${name}|${tagKey(tags)}`
    const existing = this.timers.get(key)
    if (existing === undefined) {
      this.timers.set(key, { count: 1, sum: milliseconds, min: milliseconds, max: milliseconds })
    } else {
      existing.count += 1
      existing.sum += milliseconds
      existing.min = Math.min(existing.min, milliseconds)
      existing.max = Math.max(existing.max, milliseconds)
    }
  }

  /**
   * 返回所有指标的当前快照，拷贝到普通对象/结构中，调用方对其修改不影响内部状态——
   * 用于把内存态指标安全地交给外部（日志、HTTP snapshot 端点、外部后端）。
   */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {}
    for (const [key, value] of this.counters) counters[key] = value

    const timers: Record<string, TimerSummary> = {}
    for (const [key, value] of this.timers) {
      timers[key] = { count: value.count, sumMs: value.sum, minMs: value.min, maxMs: value.max }
    }

    return { counters, timers }
  }

  /** 清空所有指标，主要用于测试在用例间隔离状态。 */
  reset(): void {
    this.counters.clear()
    this.timers.clear()
  }
}
