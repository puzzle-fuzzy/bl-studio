import { DirectorAnalysisResultSchema, DirectorScriptChatOutputSchema, type DirectorAnalysisResult, type DirectorScriptChatOutput } from '@bailian-studio/shared'

/**
 * Providers occasionally wrap JSON in markdown fences or add a short prefix.
 * We accept only a JSON object that passes the shared contract; no best-effort
 * field guessing is allowed because downstream phases depend on stable data.
 */
export function parseDirectorAnalysisOutput(text: string): DirectorAnalysisResult | undefined {
  const candidates = [text.trim(), stripCodeFence(text.trim()), extractObject(text)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorAnalysisResultSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next normalized representation.
    }
  }
  return undefined
}

export function parseDirectorScriptChatOutput(text: string): DirectorScriptChatOutput | undefined {
  const candidates = [text.trim(), stripCodeFence(text.trim()), extractObject(text)]
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      const result = DirectorScriptChatOutputSchema.safeParse(parsed)
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
