import type { ModelCatalogItem } from '@bailian-studio/api-client'

/**
 * 创作页深链参数编解码（画廊 / 提示词库 / 对比复用的统一底座）。
 *
 * 线路格式：base64url(JSON)，配合 CreatePage 的 `?select=<modelId>&params=<token>`
 * 深链把一组纯文本参数预载进表单。
 *
 * 约定：
 *  - 编码侧只接受「纯文本参数」（媒体/参考图值不入链，跨用户复用不泄露个人素材）；
 *  - 解码侧按 manifest 校验：丢弃未知字段与媒体参数值，未知 token 兜底返回 {}，
 *    避免把恶意/过期深链的参数写进表单。
 */
export function encodeDeepLinkParams(params: Record<string, unknown>): string {
  return encodeB64Url(JSON.stringify(params))
}

/** 从深链 token 解码并校验：返回可安全写入表单的文本参数；非法输入返回空对象。 */
export function decodeDeepLinkParams(
  manifest: ModelCatalogItem,
  token: string | null,
): Record<string, unknown> {
  if (token === null || token.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeB64Url(token))
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const validNames = new Map(manifest.parameters.map(parameter => [parameter.name, parameter]))
  const result: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(parsed)) {
    const parameter = validNames.get(name)
    if (parameter === undefined || !isValidParamValue(parameter.type, value)) continue
    result[name] = value
  }
  return result
}

/** 按 manifest 参数类型校验深链值；非法类型（如数字参数收到字符串）一律丢弃。 */
function isValidParamValue(type: ModelCatalogItem['parameters'][number]['type'], value: unknown): boolean {
  switch (type) {
    case 'number': return typeof value === 'number'
    case 'boolean': return typeof value === 'boolean'
    case 'text':
    case 'select': return typeof value === 'string'
    case 'media': return false
  }
}

/** Unicode 安全的 base64url 编码（浏览器 btoa 对非 Latin-1 会抛错）。 */
function encodeB64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeB64Url(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
