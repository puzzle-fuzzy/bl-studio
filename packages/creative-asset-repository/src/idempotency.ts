import type { CollectCreativeAssetFromGenerationRepositoryInput } from './types'

type CollectionFingerprintInput = Omit<
  CollectCreativeAssetFromGenerationRepositoryInput,
  'userId' | 'idempotencyKey' | 'now'
>

type CollectionBatchFingerprintInput = {
  items: CollectionFingerprintInput[]
}

/**
 * 为“收录生成产物”建立稳定请求指纹。
 *
 * 指纹只包含业务输入，不包含用户、时间和幂等键本身；对象 key 排序后
 * 再做 SHA-256，避免客户端字段顺序变化把同一请求误判为不同请求。
 */
export async function creativeAssetCollectionFingerprint(input: CollectionFingerprintInput): Promise<string> {
  const encoded = new TextEncoder().encode(stableSerialize({ operation: 'collect-asset-from-generation', ...input }))
  return sha256(encoded)
}

/** 为批量收录建立批次级指纹；数组顺序故意保留，因为它决定响应顺序。 */
export async function creativeAssetCollectionBatchFingerprint(input: CollectionBatchFingerprintInput): Promise<string> {
  const encoded = new TextEncoder().encode(stableSerialize({ operation: 'collect-asset-from-generation-batch', ...input }))
  return sha256(encoded)
}

async function sha256(encoded: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(buffer).set(encoded)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
}
