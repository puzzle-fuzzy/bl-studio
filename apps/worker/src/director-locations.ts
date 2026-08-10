import { DirectorLocationsResultSchema, type DirectorLocationsResult } from '@bailian-studio/shared'

/**
 * Locations become continuity inputs for storyboard and video prompts, so the
 * provider response must satisfy the full downstream contract before storage.
 */
export function parseDirectorLocationsOutput(text: string): DirectorLocationsResult | undefined {
  const trimmed = text.trim()
  const candidates = [trimmed, stripCodeFence(trimmed), extractObject(trimmed)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorLocationsResultSchema.safeParse(parsed)
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
