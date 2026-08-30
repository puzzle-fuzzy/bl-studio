/**
 * Repository 层共享工具（P1-H：统一五套并行约定）。
 *
 * 此前 5 个数据包（auth/credit-ledger/creative-asset/generation/director）
 * 各自维护游标编解码、限值钳制和错误基类，约定已分叉。本模块是唯一事实源。
 *
 * 渐进迁移：各包的本地实现逐步替换为从此处导入；不要求一次到位。
 */

// ── 1. 游标编解码（keyset pagination 的不透明 cursor） ──

/** 任意可 JSON 序列化的游标载荷。 */
export type CursorPayload = Record<string, string | number | boolean | null>

/** 编码游标载荷为 base64url 不透明字符串。 */
export function encodeCursor<T extends CursorPayload>(payload: T): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * 解码 base64url 游标为原始载荷。
 * 返回 undefined 表示游标无效（调用方自行决定是抛错还是忽略）。
 */
export function decodeCursor<T extends CursorPayload>(cursor: string): T | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return undefined
    return decoded as T
  }
  catch {
    return undefined
  }
}

// ── 2. 限值钳制（统一默认值 + 上限 + 非法值处理） ──

export interface LimitPolicy {
  /** 缺省 limit。 */
  readonly default: number
  /** 最大 limit。 */
  readonly max: number
}

/**
 * 钳制分页 limit：undefined → default，非法/负数 → default，超过 max → max。
 * 取代各包的"静默钳制 / throw / 不钳制"三种不同行为。
 */
export function clampLimit(limit: number | undefined, policy: LimitPolicy): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return policy.default
  return Math.min(Math.floor(limit), policy.max)
}

/** 常用策略：默认 20，最大 100。 */
export const DEFAULT_LIMIT_POLICY: LimitPolicy = { default: 20, max: 100 }

/** 常用策略：默认 50，最大 200（详情关联列表等较大数据集）。 */
export const WIDE_LIMIT_POLICY: LimitPolicy = { default: 50, max: 200 }

// ── 3. Repository 错误基类（统一继承根） ──

/**
 * 所有 repository 层错误的基类。
 * 各域的错误类（CreditLedgerError / GenerationRepositoryError / ...）应继承此类，
 * 使调用方可以用 `instanceof RepositoryError` 做统一拦截。
 */
export class RepositoryError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.details = details
  }
}
