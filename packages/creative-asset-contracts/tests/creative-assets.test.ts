import { describe, expect, it } from 'vitest'
import {
  CreativeGenerationContextSchema,
  CreateCreativeAssetSchema,
  CreateCreativeAssetVersionFromGenerationSchema,
  CreateCreativeProjectAssetSchema,
  CreateCreativeProjectSchema,
  isCreativeAssetReferenceRoleCompatible,
  normalizeCreativeGenerationContext,
} from '../src'

describe('creative asset protocol', () => {
  it('accepts a typed shot context with ordered asset bindings', () => {
    const context = CreativeGenerationContextSchema.parse({
      purpose: 'shot_video',
      projectId: 'project-1',
      prompt: '角色走进医院走廊',
      assetBindings: [
        {
          assetVersionId: 'character-v1',
          role: 'character',
          referenceIds: ['character-front', 'character-face'],
        },
        {
          assetVersionId: 'environment-v1',
          role: 'environment',
          referenceIds: ['environment-wide'],
        },
      ],
    })

    expect(context.protocolVersion).toBe(1)
    expect(context.projectId).toBe('project-1')
    expect(context.assetBindings[1]?.position).toBe(0)
  })

  it('rejects duplicate role positions so provider input order stays deterministic', () => {
    expect(() => CreativeGenerationContextSchema.parse({
      purpose: 'shot_image',
      assetBindings: [
        { assetVersionId: 'character-v1', role: 'character' },
        { assetVersionId: 'character-v2', role: 'character' },
      ],
    })).toThrow()
  })

  it('keeps asset type and reference role compatibility explicit', () => {
    expect(isCreativeAssetReferenceRoleCompatible('character', 'face_closeup')).toBe(true)
    expect(isCreativeAssetReferenceRoleCompatible('prop', 'face_closeup')).toBe(false)
    expect(isCreativeAssetReferenceRoleCompatible('environment', 'wide')).toBe(true)
  })

  it('normalizes bindings by semantic slot while preserving reference order', () => {
    const normalized = normalizeCreativeGenerationContext({
      purpose: 'shot_image',
      assetBindings: [
        { assetVersionId: 'prop-v1', role: 'prop', position: 0, referenceIds: ['prop-detail', 'prop-front'] },
        { assetVersionId: 'character-v1', role: 'character', position: 0, referenceIds: ['character-front'] },
      ],
    })

    expect(normalized.assetBindings.map(binding => binding.role)).toEqual(['character', 'prop'])
    expect(normalized.assetBindings[1]?.referenceIds).toEqual(['prop-detail', 'prop-front'])
  })

  it('does not accept a blank creative asset name', () => {
    expect(() => CreateCreativeAssetSchema.parse({
      type: 'prop',
      name: '   ',
    })).toThrow()
  })

  it('models project organization separately from reusable asset identity', () => {
    expect(CreateCreativeProjectSchema.parse({ title: '夜行者' })).toEqual({ title: '夜行者' })
    expect(CreateCreativeProjectAssetSchema.parse({
      projectId: 'project-1',
      assetId: 'character-1',
    })).toMatchObject({
      projectId: 'project-1',
      assetId: 'character-1',
      sortOrder: 0,
    })
  })

  it('requires deterministic positions and unique artifacts when collecting generation output', () => {
    const parsed = CreateCreativeAssetVersionFromGenerationSchema.parse({
      sourceGenerationId: 'generation-1',
      references: [{ artifactId: 'artifact-1', role: 'front' }],
    })

    expect(parsed.references[0]).toMatchObject({ artifactId: 'artifact-1', role: 'front', position: 0 })
    expect(() => CreateCreativeAssetVersionFromGenerationSchema.parse({
      sourceGenerationId: 'generation-1',
      references: [
        { artifactId: 'artifact-1', role: 'front', position: 0 },
        { artifactId: 'artifact-1', role: 'side', position: 0 },
      ],
    })).toThrow()
  })
})
