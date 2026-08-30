/**
 * 实体提取输出的解析与校验。
 *
 * 核心不变量：**服务端从不信任 LLM 给出的偏移量**。LLM 返回的 mentions 是
 * 剧本原文的子串，服务端用 `indexOf` 逐一验证并自行计算 UTF-16 code unit
 * 偏移。不存在的 mention 被静默丢弃；全部 mention 无效的实体被过滤。
 * 这确保了前端注解渲染永远只使用服务端验证过的范围（参考 bailian-studio-reset
 * 的"never re-scan names, only render persisted ranges"原则）。
 */

export interface ParsedEntityCandidate {
  kind: 'character' | 'scene' | 'prop'
  name: string
  description: string
  traits: string[]
  mentions: Array<{ text: string; start: number; end: number }>
}

interface LlmEntity {
  kind?: unknown
  name?: unknown
  description?: unknown
  traits?: unknown
  mentions?: unknown
}

/**
 * 解析 LLM 实体提取输出，校验 mentions 并计算服务端偏移。
 * 返回 undefined 表示输出完全无法解析。
 */
export function parseEntityExtractionOutput(
  output: string,
  screenplayText: string,
): ParsedEntityCandidate[] | undefined {
  const parsed = tryParseJson(output)
  if (parsed === undefined) return undefined

  const entities = Array.isArray(parsed.entities) ? parsed.entities : []
  const results: ParsedEntityCandidate[] = []

  for (const raw of entities) {
    if (typeof raw !== 'object' || raw === null) continue
    const entity = raw as LlmEntity

    const kind = normalizeKind(entity.kind)
    const name = typeof entity.name === 'string' ? entity.name.trim() : ''
    if (kind === undefined || name.length === 0) continue

    const description = typeof entity.description === 'string' ? entity.description.trim() : ''
    const traits = Array.isArray(entity.traits)
      ? entity.traits.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : []

    const mentions = validateMentions(entity.mentions, screenplayText)
    // 全部 mention 无效的实体没有价值（无法定位到剧本位置）
    if (mentions.length === 0) continue

    results.push({ kind, name, description, traits, mentions })
  }

  return results
}

/** 逐字校验 mention 子串并计算 UTF-16 code unit 偏移。 */
function validateMentions(
  rawMentions: unknown,
  screenplayText: string,
): Array<{ text: string; start: number; end: number }> {
  if (!Array.isArray(rawMentions)) return []
  const valid: Array<{ text: string; start: number; end: number }> = []

  for (const raw of rawMentions) {
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (text.length === 0 || text.length > 200) continue

    // indexOf 精确匹配：找到第一次出现的位置
    const start = screenplayText.indexOf(text)
    if (start === -1) continue // 不在剧本原文中，丢弃

    valid.push({ text, start, end: start + text.length })
  }

  // 去重（同一子串可能出现多次，只保留首个偏移）
  const seen = new Set<string>()
  return valid.filter(m => {
    if (seen.has(m.text)) return false
    seen.add(m.text)
    return true
  })
}

function normalizeKind(value: unknown): 'character' | 'scene' | 'prop' | undefined {
  if (value === 'character' || value === 'scene' || value === 'prop') return value
  return undefined
}

function tryParseJson(text: string): { entities?: unknown } | undefined {
  const trimmed = text.trim()
  // 尝试直接解析
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null) return parsed as { entities?: unknown }
  }
  catch { /* 继续 */ }
  // 尝试去掉 Markdown 围栏
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed as { entities?: unknown }
    }
    catch { /* 继续 */ }
  }
  return undefined
}
