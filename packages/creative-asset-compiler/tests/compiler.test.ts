import { getModelById } from '@bailian-studio/dashscope-manifests'
import type { FrozenModelManifest } from '@bailian-studio/model-core'
import { describe, expect, it } from 'vitest'
import { CreativeAssetCompilerError, compileCreativeGeneration, type ApprovedCreativeAssetBindingInput } from '../src'

const referenceModel = getModelById('wanx-2.7-reference-video')
if (referenceModel === undefined) throw new Error('reference model fixture is unavailable')
const imageBracketReferenceModel = {
  ...referenceModel,
  request: { ...referenceModel.request, referenceFormat: 'image-bracket' as const },
} as FrozenModelManifest

function binding(
  assetVersionId: string,
  assetType: ApprovedCreativeAssetBindingInput['assetType'],
  role: ApprovedCreativeAssetBindingInput['role'],
  referenceId: string,
  userAssetId: string,
  referenceRole: NonNullable<ApprovedCreativeAssetBindingInput['references'][number]['role']>,
): ApprovedCreativeAssetBindingInput {
  return {
    assetVersionId,
    assetVersionStatus: 'approved',
    assetType,
    role,
    position: 0,
    referenceIds: [referenceId],
    references: [{ id: referenceId, userAssetId, mediaKind: 'image', role: referenceRole }],
  }
}

describe('creative asset compiler', () => {
  it('compiles approved references into model media params and provider prompt syntax', () => {
    const compiled = compileCreativeGeneration({
      manifest: imageBracketReferenceModel,
      purpose: 'shot_video',
      projectId: 'project-night-runner',
      prompt: '@图2 走进走廊，然后看向 @图1',
      negativePrompt: '脸部变形',
      parameterValues: { duration: 5, ratio: '9:16' },
      bindings: [
        binding('environment-v1', 'environment', 'environment', 'environment-wide', 'user-environment', 'wide'),
        binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front'),
      ],
    })

    expect(compiled.params).toMatchObject({
      prompt: '[Image 2] 走进走廊，然后看向 [Image 1]',
      negativePrompt: '脸部变形',
      duration: 5,
      ratio: '9:16',
    })
    expect(compiled.params).not.toHaveProperty('references')
    expect(compiled.assetRefs).toEqual({ references: ['user-character', 'user-environment'] })
    expect(compiled.creativeContext).toMatchObject({
      protocolVersion: 1,
      purpose: 'shot_video',
      projectId: 'project-night-runner',
      modelId: imageBracketReferenceModel.id,
      prompt: '[Image 2] 走进走廊，然后看向 [Image 1]',
      assetBindings: [
        { assetVersionId: 'character-v1', role: 'character', referenceIds: ['character-front'] },
        { assetVersionId: 'environment-v1', role: 'environment', referenceIds: ['environment-wide'] },
      ],
    })
    expect(compiled.selectedReferences.map(reference => reference.position)).toEqual([0, 1])
    expect(compiled.creativeContext.capabilitySnapshot).toMatchObject({
      modelId: imageBracketReferenceModel.id,
      referenceFormat: 'image-bracket',
      selectedReferenceCount: 2,
      mediaParameterNames: ['references'],
    })
  })

  it('keeps provider reference order deterministic when bindings arrive in another order', () => {
    const first = binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front')
    const second = binding('environment-v1', 'environment', 'environment', 'environment-wide', 'user-environment', 'wide')

    const compiled = compileCreativeGeneration({
      manifest: referenceModel,
      purpose: 'shot_video',
      prompt: '@图1 和 @图2',
      bindings: [second, first],
      parameterValues: { duration: 5 },
    })

    expect(compiled.assetRefs).toEqual({ references: ['user-character', 'user-environment'] })
    expect(compiled.params.prompt).toBe('图1 和 图2')
    expect(compiled.selectedReferences.map(reference => reference.referenceId)).toEqual([
      'character-front',
      'environment-wide',
    ])
  })

  it('rejects a non-approved version before model compilation', () => {
    const candidate = binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front')
    const input = { ...candidate, assetVersionStatus: 'candidate' as const }

    expect(() => compileCreativeGeneration({
      manifest: referenceModel,
      purpose: 'shot_video',
      prompt: '角色走路',
      bindings: [input],
    })).toThrowError(CreativeAssetCompilerError)

    try {
      compileCreativeGeneration({
        manifest: referenceModel,
        purpose: 'shot_video',
        prompt: '角色走路',
        bindings: [input],
      })
    } catch (error) {
      expect(error).toMatchObject({ code: 'CREATIVE_COMPILER_ASSET_VERSION_NOT_APPROVED' })
    }
  })

  it('rejects an out-of-range prompt reference instead of silently leaving it unresolved', () => {
    expect(() => compileCreativeGeneration({
      manifest: referenceModel,
      purpose: 'shot_video',
      prompt: '角色看向 @图2',
      bindings: [binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front')],
    })).toThrowError(/outside the selected reference range/)
  })

  it('rejects ambiguous same-kind media slots unless the caller chooses one', () => {
    const ambiguousManifest = {
      ...referenceModel,
      parameters: [
        ...referenceModel.parameters,
        { name: 'alternateReferences', label: '备用参考图', type: 'media', mediaKind: 'image', maxItems: 7 },
      ],
      request: {
        ...referenceModel.request,
        bindings: {
          ...referenceModel.request.bindings,
          alternateReferences: { target: 'input.media', mediaType: 'reference_image' },
        },
      },
    } as FrozenModelManifest

    expect(() => compileCreativeGeneration({
      manifest: ambiguousManifest,
      purpose: 'shot_video',
      prompt: '角色走路',
      bindings: [binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front')],
    })).toThrowError(/multiple image media parameters/)
  })

  it('rejects disabled models even when their manifest shape is otherwise valid', () => {
    const disabledManifest = {
      ...referenceModel,
      availability: { enabled: false, stage: 'hidden' as const, notActivated: '暂未开通' },
    } as FrozenModelManifest

    expect(() => compileCreativeGeneration({
      manifest: disabledManifest,
      purpose: 'shot_video',
      prompt: '角色走路',
      bindings: [binding('character-v1', 'character', 'character', 'character-front', 'user-character', 'front')],
    })).toThrowError(/not enabled for generation/)
  })
})
