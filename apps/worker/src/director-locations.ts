import { DirectorLocationsResultSchema, type DirectorLocationsResult } from '@bailian-studio/director-contracts'

export type DirectorLocationsParseMode = 'strict-json' | 'normalized-json' | 'repaired-json' | 'invalid'

export interface DirectorLocationsParseResult {
  locations?: DirectorLocationsResult
  mode: DirectorLocationsParseMode
}

/**
 * Locations become continuity inputs for storyboard and video prompts, so the
 * provider response must satisfy the full downstream contract before storage.
 */
export function parseDirectorLocationsOutput(text: string): DirectorLocationsResult | undefined {
  return parseDirectorLocationsOutputDetailed(text).locations
}

/**
 * Providers occasionally omit the closing brace of the final object in an
 * array even when all fields are present. We repair only that structural
 * mistake, then still require the strict shared schema before accepting it.
 * No fields are guessed, renamed, or dropped.
 */
export function parseDirectorLocationsOutputDetailed(text: string): DirectorLocationsParseResult {
  const trimmed = text.trim()
  const candidates = uniqueCandidates([trimmed, stripCodeFence(trimmed), extractObject(trimmed)])
  for (const candidate of candidates) {
    const result = parseCandidate(candidate)
    if (result !== undefined) return { locations: result, mode: candidate === trimmed ? 'strict-json' : 'normalized-json' }
  }
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    const repaired = repairMissingObjectClosers(candidate)
    if (repaired === undefined || repaired === candidate) continue
    const result = parseCandidate(repaired)
    if (result !== undefined) return { locations: result, mode: 'repaired-json' }
  }
  return { mode: 'invalid' }
}

function parseCandidate(candidate: string): DirectorLocationsResult | undefined {
  try {
    const parsed: unknown = JSON.parse(candidate)
    const result = DirectorLocationsResultSchema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function uniqueCandidates(candidates: string[]): string[] {
  return [...new Set(candidates.filter(candidate => candidate.length > 0))]
}

/** Insert a missing `}` only when a `]` directly closes an object item. */
function repairMissingObjectClosers(value: string): string | undefined {
  const stack: Array<'object' | 'array'> = []
  let repaired = ''
  let inString = false
  let escaped = false
  let repairCount = 0

  for (const character of value) {
    if (inString) {
      repaired += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      repaired += character
      continue
    }
    if (character === '{') {
      stack.push('object')
      repaired += character
      continue
    }
    if (character === '[') {
      stack.push('array')
      repaired += character
      continue
    }
    if (character === '}') {
      if (stack.at(-1) !== 'object') return undefined
      stack.pop()
      repaired += character
      continue
    }
    if (character === ']') {
      if (stack.at(-1) === 'array') {
        stack.pop()
        repaired += character
        continue
      }
      if (stack.at(-1) === 'object' && stack.at(-2) === 'array' && repairCount < 4) {
        repairCount += 1
        stack.pop()
        stack.pop()
        repaired += '}]'
        continue
      }
      return undefined
    }
    repaired += character
  }

  return inString || stack.length !== 0 ? undefined : repaired
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
