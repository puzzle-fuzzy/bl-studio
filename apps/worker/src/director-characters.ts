import { DirectorCharactersResultSchema, type DirectorCharactersResult } from '@bailian-studio/director-contracts'

/**
 * Character generation is a downstream contract, so malformed provider output
 * is rejected instead of being silently converted into partial character data.
 */
export function parseDirectorCharactersOutput(text: string): DirectorCharactersResult | undefined {
  const trimmed = text.trim()
  const candidates = [trimmed, stripCodeFence(trimmed), extractObject(trimmed)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorCharactersResultSchema.safeParse(parsed)
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
