import { describe, expect, it } from 'vitest'
import {
  CreateGenerationSchema,
  GetGenerationSchema,
  ListGenerationsSchema,
  SetGenerationLibraryStateSchema,
  UserIdQuerySchema,
  safeValidate,
  validateInput,
  ValidationError,
} from '../src'

describe('validation schemas', () => {
  it('accepts a well-formed create-generation body', () => {
    const parsed = CreateGenerationSchema.parse({
      modelId: 'qwen-plus',
      userId: 'user-1',
      params: { prompt: 'hi', maxTokens: 64 },
      idempotencyKey: 'k-1',
    })
    expect(parsed.modelId).toBe('qwen-plus')
    expect(parsed.idempotencyKey).toBe('k-1')
  })

  it('accepts ordered generation asset bindings and rejects empty bindings', () => {
    const parsed = CreateGenerationSchema.parse({
      modelId: 'qwen-image-edit',
      params: { prompt: 'edit this' },
      assetRefs: { image: ['asset-a', 'asset-b'] },
    })
    expect(parsed.assetRefs).toEqual({ image: ['asset-a', 'asset-b'] })

    expect(() => CreateGenerationSchema.parse({
      modelId: 'qwen-image-edit',
      params: { prompt: 'edit this' },
      assetRefs: {},
    })).toThrow()
    expect(() => CreateGenerationSchema.parse({
      modelId: 'qwen-image-edit',
      params: { prompt: 'edit this' },
      assetRefs: { image: [] },
    })).toThrow()
  })

  it('rejects a create-generation body missing required modelId/userId', () => {
    expect(() => CreateGenerationSchema.parse({ params: {} })).toThrow()
  })

  it('coerces, defaults, and bounds list-generations query params', () => {
    const parsed = ListGenerationsSchema.parse({
      userId: 'user-1',
      limit: '5',
      views: 'completed,hidden,completed',
    })
    expect(parsed.limit).toBe(5) // coerced from string
    expect(parsed.views).toEqual(['completed', 'hidden'])

    const defaulted = ListGenerationsSchema.parse({ userId: 'user-1' })
    expect(defaulted.limit).toBe(20) // default

    expect(() => ListGenerationsSchema.parse({ userId: 'user-1', limit: 0 })).toThrow()
    expect(() => ListGenerationsSchema.parse({ userId: 'user-1', limit: 101 })).toThrow()
    expect(() => ListGenerationsSchema.parse({ views: 'completed,unknown' })).toThrow()
  })

  it('accepts only explicit generation library states', () => {
    expect(SetGenerationLibraryStateSchema.parse({ state: 'hidden' })).toEqual({
      state: 'hidden',
    })
    expect(() => SetGenerationLibraryStateSchema.parse({ state: 'archived' })).toThrow()
  })

  it('requires a non-empty userId and id', () => {
    expect(() => UserIdQuerySchema.parse({})).toThrow()
    expect(() => GetGenerationSchema.parse({ id: '' })).toThrow()
  })
})

describe('validateInput / safeValidate', () => {
  it('returns parsed data when valid', () => {
    const data = validateInput(UserIdQuerySchema, { userId: 'user-1' })
    expect(data.userId).toBe('user-1')
  })

  it('throws a ValidationError carrying the failing field when invalid', () => {
    try {
      validateInput(UserIdQuerySchema, {})
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      const field = (error as ValidationError).field
      expect(field).toBe('userId')
    }
  })

  it('safeValidate returns a discriminated result', () => {
    expect(safeValidate(UserIdQuerySchema, { userId: 'user-1' }).success).toBe(true)
    const bad = safeValidate(UserIdQuerySchema, {})
    expect(bad.success).toBe(false)
  })
})
