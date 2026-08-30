import { DirectorAnalysisResultSchema, DirectorScriptChatOutputSchema, type DirectorAnalysisResult, type DirectorScriptChatOutput } from '@bailian-studio/director-contracts'

export type DirectorScriptChatParseMode = 'strict-json' | 'normalized-json' | 'invalid'

export interface DirectorScriptChatParseResult {
  output?: DirectorScriptChatOutput
  mode: DirectorScriptChatParseMode
  topLevelKeys: string[]
  issuePaths: string[]
}

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
  return parseDirectorScriptChatOutputDetailed(text).output
}

/**
 * Some text models return the same screenplay analysis with stable semantic
 * aliases such as `scene`/`function` or `details`/`atmosphere`. We normalize
 * only those known aliases and still validate the final object against the
 * strict shared contract before it reaches downstream phases.
 */
export function parseDirectorScriptChatOutputDetailed(text: string): DirectorScriptChatParseResult {
  const candidates = [text.trim(), stripCodeFence(text.trim()), extractObject(text)]
  let topLevelKeys: string[] = []
  let issuePaths: string[] = []
  for (const candidate of candidates) {
    if (candidate.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(candidate)
      topLevelKeys = recordKeys(parsed)
      const result = DirectorScriptChatOutputSchema.safeParse(parsed)
      if (result.success) return { output: result.data, mode: 'strict-json', topLevelKeys, issuePaths: [] }

      issuePaths = result.error.issues.slice(0, 20).map(issue => issue.path.length > 0 ? issue.path.join('.') : issue.code)
      const normalized = DirectorScriptChatOutputSchema.safeParse(normalizeScriptChatOutput(parsed))
      if (normalized.success) {
        return { output: normalized.data, mode: 'normalized-json', topLevelKeys, issuePaths }
      }
      issuePaths = normalized.error.issues.slice(0, 20).map(issue => issue.path.length > 0 ? issue.path.join('.') : issue.code)
    } catch {
      // Try the next normalized representation.
    }
  }
  return { mode: 'invalid', topLevelKeys, issuePaths }
}

function normalizeScriptChatOutput(value: unknown): unknown {
  if (!isRecord(value)) return value
  const analysis = isRecord(value.analysis) ? normalizeAnalysis(value.analysis) : value.analysis
  return {
    ...(textValue(value.reply) === undefined ? {} : { reply: textValue(value.reply) }),
    ...(textValue(value.screenplay) === undefined ? {} : { screenplay: textValue(value.screenplay) }),
    ...(value.synopsis === null ? { synopsis: null } : textValue(value.synopsis) === undefined ? {} : { synopsis: textValue(value.synopsis) }),
    ...(analysis === undefined ? {} : { analysis }),
    ...(Array.isArray(value.changes) ? { changes: stringList(value.changes) } : {}),
  }
}

function normalizeAnalysis(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(textValue(value.summary) === undefined ? {} : { summary: textValue(value.summary) }),
    ...(textValue(value.theme) === undefined ? {} : { theme: textValue(value.theme) }),
    ...(textValue(value.audience) === undefined ? {} : { audience: textValue(value.audience) }),
    ...(Array.isArray(value.structure) ? {
      structure: value.structure.map(item => {
        const row = isRecord(item) ? item : {}
        return {
          ...(textValue(row.name ?? row.scene) === undefined ? {} : { name: textValue(row.name ?? row.scene) }),
          ...(textValue(row.purpose ?? row.function) === undefined ? {} : { purpose: textValue(row.purpose ?? row.function) }),
          ...(Array.isArray(row.beats) ? { beats: stringList(row.beats) } : {}),
        }
      }),
    } : {}),
    ...(Array.isArray(value.characters) ? {
      characters: value.characters.map(item => {
        const row = isRecord(item) ? item : {}
        const role = row.role ?? row.function ?? row.keyProps
        const description = row.description ?? row.arc ?? row.details ?? row.keyProps
        return {
          ...(textValue(row.name) === undefined ? {} : { name: textValue(row.name) }),
          ...(textValue(role) === undefined ? {} : { role: textValue(role) }),
          ...(textValue(description) === undefined ? {} : { description: textValue(description) }),
          ...(Array.isArray(row.traits) ? { traits: stringList(row.traits) } : Array.isArray(row.keyProps) ? { traits: stringList(row.keyProps) } : {}),
        }
      }),
    } : {}),
    ...(Array.isArray(value.locations) ? {
      locations: value.locations.map(item => {
        const row = isRecord(item) ? item : {}
        const description = row.description ?? row.details ?? row.function
        const atmosphere = row.atmosphere ?? row.function ?? row.details
        return {
          ...(textValue(row.name) === undefined ? {} : { name: textValue(row.name) }),
          ...(textValue(description) === undefined ? {} : { description: textValue(description) }),
          ...(textValue(atmosphere) === undefined ? {} : { atmosphere: textValue(atmosphere) }),
        }
      }),
    } : {}),
    ...(Array.isArray(value.continuityRisks) ? { continuityRisks: stringList(value.continuityRisks) } : {}),
    ...(Array.isArray(value.visualMotifs) ? { visualMotifs: stringList(value.visualMotifs) } : {}),
  }
}

function stringList(value: unknown[]): string[] {
  return value.flatMap(item => {
    const text = textValue(item)
    return text === undefined ? [] : [text]
  })
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const result = value.trim()
    return result.length > 0 ? result : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const result = stringList(value).join('、').trim()
    return result.length > 0 ? result : undefined
  }
  if (isRecord(value)) {
    const result = Object.entries(value)
      .flatMap(([key, item]) => {
        const itemText = textValue(item)
        return itemText === undefined ? [] : [`${key}: ${itemText}`]
      })
      .join('；')
      .trim()
    return result.length > 0 ? result : undefined
  }
  return undefined
}

function recordKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).sort() : []
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
