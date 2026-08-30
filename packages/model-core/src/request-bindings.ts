import type { ModelParameterBinding } from './types'

/** Prompt reference syntaxes understood by product-level media workflows. */
export type ModelReferenceFormat = 'angle-bracket' | 'image-bracket' | 'chinese'

/**
 * Read the small binding vocabulary shared by model-aware product compilers.
 * Provider manifests may attach extra fields, but consumers only rely on the
 * normalized target and, for field bindings, the destination field.
 */
export function readModelParameterBinding(value: unknown): ModelParameterBinding | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const target = record.target
  if (target === 'input.prompt' || target === 'input.media' || target === 'ui.only') {
    return { target }
  }
  if (target === 'input.field') {
    return typeof record.field === 'string' ? { target, field: record.field } : undefined
  }
  if (target === 'parameters.field') {
    return record.field === undefined || typeof record.field === 'string'
      ? { target, ...(record.field === undefined ? {} : { field: record.field }) }
      : undefined
  }
  return undefined
}

/**
 * Normalize an optional manifest reference syntax without exposing provider
 * contract types to product compilers and workflow handlers.
 */
export function readModelReferenceFormat(value: unknown): ModelReferenceFormat {
  return value === 'angle-bracket' || value === 'image-bracket' || value === 'chinese'
    ? value
    : 'angle-bracket'
}
