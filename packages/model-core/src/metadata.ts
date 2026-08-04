import type { FrozenModelManifest, ModelManifest } from './types'

export interface ModelAuditMetadata {
  pricingVersion: string
  manifestHash: string
}

/**
 * 为模型契约返回确定且运行时可移植的标识符。
 * 这是审计指纹而非安全签名：刻意使用小型纯 JS 哈希，使 model-core 无需
 * Node crypto 依赖即可在浏览器与 worker bundle 中可用。
 */
export function getModelAuditMetadata(manifest: FrozenModelManifest | ModelManifest): ModelAuditMetadata {
  return {
    pricingVersion: `pricing-${fingerprint(manifest.pricing)}`,
    manifestHash: `manifest-${fingerprint(manifest)}`,
  }
}

function fingerprint(value: unknown): string {
  const input = canonicalize(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b1

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x85ebca6b)
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}
