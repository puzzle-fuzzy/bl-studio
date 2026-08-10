import { DirectorStoryboardResultSchema, type DirectorStoryboardResult } from '@bailian-studio/shared'

/**
 * Storyboard output is persisted as reviewable shot cards. Rejecting partial
 * provider output here prevents a malformed shot from silently entering a
 * later video-generation phase.
 */
export function parseDirectorStoryboardOutput(text: string): DirectorStoryboardResult | undefined {
  const trimmed = text.trim()
  const candidates = [trimmed, stripCodeFence(trimmed), extractObject(trimmed)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorStoryboardResultSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next normalized representation.
    }
  }
  return undefined
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function extractObject(value: string): string {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  return start >= 0 && end > start ? value.slice(start, end + 1) : ''
}
