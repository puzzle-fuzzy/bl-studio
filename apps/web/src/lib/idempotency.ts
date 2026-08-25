/**
 * 幂等提交键。
 *
 * 生成提交的幂等性依赖稳定 idempotencyKey：相同 payload 应当复用同一个 key。
 * 原 Vue 版只在提交前生成一次 key，提交后即丢弃——网络抖动重复提交会产生
 * 新 key，幂等保护弱于预期。这里改为按 payload 指纹缓存 key：相同 payload 在
 * 缓存窗口内恒复用同一 key，直到成功提交后才可清理（由调用方决定）。
 */

/** 深度稳定的 JSON 序列化：对象键按字典序，保证相同逻辑内容产生相同指纹。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? JSON.stringify(value) : String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export interface IdempotencyPayload {
  modelId: string
  params: Record<string, unknown>
  assetRefs?: Record<string, unknown>
  creativeContext?: unknown
}

/** 生成提交 payload 的指纹。 */
export function payloadFingerprint(payload: IdempotencyPayload): string {
  return stableStringify({ modelId: payload.modelId, params: payload.params, assetRefs: payload.assetRefs, creativeContext: payload.creativeContext })
}

const MAX_CACHED = 100
const fingerprintToKey = new Map<string, string>()

/**
 * 按 payload 指纹返回幂等键。相同指纹恒返回同一 key（缓存窗口内），
 * 从而幂等提交对重复点击/网络重试生效。
 */
export function idempotencyKeyFor(payload: IdempotencyPayload): string {
  const fingerprint = payloadFingerprint(payload)
  const cached = fingerprintToKey.get(fingerprint)
  if (cached !== undefined) return cached
  const key = crypto.randomUUID()
  fingerprintToKey.set(fingerprint, key)
  if (fingerprintToKey.size > MAX_CACHED) {
    const oldest = fingerprintToKey.keys().next().value
    if (oldest !== undefined) fingerprintToKey.delete(oldest)
  }
  return key
}

/** 提交成功后调用，释放指纹缓存（下次同样 payload 视为新提交）。 */
export function clearIdempotencyKey(payload: IdempotencyPayload): void {
  fingerprintToKey.delete(payloadFingerprint(payload))
}

/** 清空全部指纹缓存。登出时调用，避免跨用户复用同一幂等键（P1-07）。 */
export function clearIdempotencyKeys(): void {
  fingerprintToKey.clear()
}
