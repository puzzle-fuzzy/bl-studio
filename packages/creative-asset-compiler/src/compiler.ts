import {
  getModelAuditMetadata,
  validateModelParams,
} from '@bailian-studio/model-core'
import type { ModelParameterBinding } from '@bailian-studio/model-core'
import {
  CREATIVE_ASSET_PROTOCOL_VERSION,
  CreativeGenerationContextSchema,
  isCreativeAssetReferenceRoleCompatible,
  normalizeCreativeGenerationContext,
  type CreativeGenerationBinding,
} from '@bailian-studio/creative-asset-contracts'
import { CreativeAssetCompilerError } from './errors'
import type {
  ApprovedCreativeAssetBindingInput,
  CompileCreativeGenerationInput,
  CompiledCreativeGeneration,
  CreativeAssetCompilerMediaKind,
  CreativeAssetCompilerManifest,
  CreativeAssetCompilerReferenceInput,
} from './types'

const COMPILER_PROTOCOL_VERSION = 1 as const
const CREATIVE_ASSET_COMPILER_MEDIA_KINDS: readonly CreativeAssetCompilerMediaKind[] = ['image', 'video', 'audio']

export function compileCreativeGeneration(
  input: CompileCreativeGenerationInput,
): CompiledCreativeGeneration {
  assertModelAvailable(input.manifest)

  const promptParameter = findPromptParameter(input.manifest)
  const negativePromptParameter = findNegativePromptParameter(input.manifest)
  const parameterValues = normalizeParameterValues(
    input,
    promptParameter.name,
    negativePromptParameter?.name,
  )
  const bindings = normalizeBindings(input.bindings ?? [])
  const selectedReferences = selectReferences(bindings)
  const mediaParameterByKind = resolveMediaParameters(input.manifest, selectedReferences, input.mediaParameterName)
  const providerReferences = orderProviderReferences(mediaParameterByKind, input.manifest)
  const resolvedPrompt = resolvePromptReferences(
    input.prompt.trim(),
    referenceFormatFor(input.manifest),
    providerReferences.length,
  )

  const validationParams: Record<string, unknown> = {
    ...parameterValues,
    [promptParameter.name]: resolvedPrompt,
  }
  if (input.negativePrompt !== undefined && input.negativePrompt.trim().length > 0) {
    if (negativePromptParameter === undefined) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_PROMPT_UNSUPPORTED',
        `Model ${input.manifest.id} does not support a negative prompt`,
        { field: 'negativePrompt' },
      )
    }
    validationParams[negativePromptParameter.name] = input.negativePrompt.trim()
  }
  for (const [parameterName, references] of mediaParameterByKind.entries()) {
    const ids = references.map(reference => reference.userAssetId)
    const parameter = input.manifest.parameters.find(candidate => candidate.name === parameterName)
    if (parameter === undefined) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_MEDIA_PARAMETER_NOT_FOUND',
        `Media parameter ${parameterName} is not declared by model ${input.manifest.id}`,
        { parameterName },
      )
    }
    validationParams[parameterName] = (parameter.maxItems ?? 1) > 1 ? ids : ids[0]
  }

  const validation = validateModelParams(input.manifest, validationParams)
  if (!validation.valid) {
    throw new CreativeAssetCompilerError(
      'CREATIVE_COMPILER_MODEL_VALIDATION_FAILED',
      `Model ${input.manifest.id} rejected the compiled generation input`,
      { issues: validation.errors },
    )
  }

  const mediaParameterNames = new Set(input.manifest.parameters
    .filter(parameter => parameter.type === 'media')
    .map(parameter => parameter.name))
  const params = Object.fromEntries(
    Object.entries(validation.params).filter(([name]) => !mediaParameterNames.has(name)),
  )
  const assetRefs = Object.fromEntries(
    providerMediaParameterNames(input.manifest)
      .map(parameterName => [parameterName, mediaParameterByKind.get(parameterName)?.map(reference => reference.userAssetId) ?? []] as const)
      .filter(([, ids]) => ids.length > 0),
  )
  const selectedReferenceRows = providerReferences.map((reference, position) => ({
    referenceId: reference.referenceId,
    userAssetId: reference.userAssetId,
    assetVersionId: reference.assetVersionId,
    role: reference.role,
    parameterName: reference.parameterName,
    position,
  }))

  const metadata = getModelAuditMetadata(input.manifest)
  const requestKind = input.manifest.request.kind
  const referenceFormat = referenceFormatFor(input.manifest)
  const capabilitySnapshot = {
    ...(input.capabilitySnapshot ?? {}),
    compilerProtocolVersion: COMPILER_PROTOCOL_VERSION,
    modelId: input.manifest.id,
    modelManifestHash: metadata.manifestHash,
    pricingVersion: metadata.pricingVersion,
    capabilities: [...input.manifest.capabilities],
    requestKind,
    ...(referenceFormat === undefined ? {} : { referenceFormat }),
    mediaParameterNames: Object.keys(assetRefs),
    selectedReferenceCount: providerReferences.length,
  }
  const contextBindings: CreativeGenerationBinding[] = bindings.map(binding => ({
    assetVersionId: binding.assetVersionId,
    role: binding.role,
    position: binding.position,
    referenceIds: [...binding.referenceIds],
  }))
  const context = normalizeCreativeGenerationContext(CreativeGenerationContextSchema.parse({
    protocolVersion: CREATIVE_ASSET_PROTOCOL_VERSION,
    purpose: input.purpose,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    prompt: resolvedPrompt,
    ...(input.negativePrompt === undefined || input.negativePrompt.trim().length === 0
      ? {}
      : { negativePrompt: input.negativePrompt.trim() }),
    modelId: input.manifest.id,
    assetBindings: contextBindings,
    recipe: { ...(input.recipe ?? {}) },
    capabilitySnapshot,
  }))

  return {
    modelId: input.manifest.id,
    params,
    assetRefs,
    creativeContext: context,
    selectedReferences: selectedReferenceRows,
  }
}

function assertModelAvailable(manifest: CreativeAssetCompilerManifest): void {
  if (!manifest.availability.enabled) {
    throw new CreativeAssetCompilerError(
      'CREATIVE_COMPILER_MODEL_UNAVAILABLE',
      `Model ${manifest.id} is not enabled for generation`,
      { modelId: manifest.id, reason: manifest.availability.notActivated },
    )
  }
}

function findPromptParameter(manifest: CreativeAssetCompilerManifest): CreativeAssetCompilerManifest['parameters'][number] {
  const candidates = manifest.parameters.filter(parameter => (
    parameter.type === 'text' && bindingFor(manifest, parameter.name)?.target === 'input.prompt'
  ))
  if (candidates.length === 1) return candidates[0] as CreativeAssetCompilerManifest['parameters'][number]
  const fallback = manifest.parameters.find(parameter => parameter.type === 'text' && parameter.name === 'prompt')
  if (fallback !== undefined) return fallback
  throw new CreativeAssetCompilerError(
    'CREATIVE_COMPILER_PROMPT_UNSUPPORTED',
    `Model ${manifest.id} does not declare a prompt parameter`,
    { modelId: manifest.id },
  )
}

function findNegativePromptParameter(manifest: CreativeAssetCompilerManifest): CreativeAssetCompilerManifest['parameters'][number] | undefined {
  const candidates = manifest.parameters.filter(parameter => {
    if (parameter.type !== 'text') return false
    if (parameter.name === 'negativePrompt') return true
    const binding = bindingFor(manifest, parameter.name)
    return binding?.target === 'input.field' && binding.field === 'negative_prompt'
  })
  if (candidates.length > 1) {
    throw new CreativeAssetCompilerError(
      'CREATIVE_COMPILER_PROMPT_UNSUPPORTED',
      `Model ${manifest.id} declares multiple negative prompt parameters`,
      { parameters: candidates.map(parameter => parameter.name) },
    )
  }
  return candidates[0]
}

function normalizeParameterValues(
  input: CompileCreativeGenerationInput,
  promptParameterName: string,
  negativePromptParameterName: string | undefined,
): Record<string, unknown> {
  const values = { ...(input.parameterValues ?? {}) }
  const mediaParameterNames = new Set(input.manifest.parameters
    .filter(parameter => parameter.type === 'media')
    .map(parameter => parameter.name))
  for (const name of Object.keys(values)) {
    if (mediaParameterNames.has(name)) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_PARAMETER_CONFLICT',
        `Media parameter ${name} must be supplied through approved creative asset references`,
        { parameterName: name },
      )
    }
  }
  for (const name of [promptParameterName, negativePromptParameterName]) {
    if (name !== undefined && Object.hasOwn(values, name)) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_PARAMETER_CONFLICT',
        `Parameter ${name} must be supplied through the compiler input field`,
        { parameterName: name },
      )
    }
  }
  return values
}

function normalizeBindings(bindings: readonly ApprovedCreativeAssetBindingInput[]): ApprovedCreativeAssetBindingInput[] {
  const slots = new Set<string>()
  return [...bindings]
    .map(binding => {
      if (binding.assetVersionStatus !== 'approved') {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_ASSET_VERSION_NOT_APPROVED',
          `Asset version ${binding.assetVersionId} is not approved`,
          { assetVersionId: binding.assetVersionId, status: binding.assetVersionStatus },
        )
      }
      if (binding.assetType !== binding.role) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_BINDING_INVALID',
          `Asset type ${binding.assetType} cannot be bound as ${binding.role}`,
          { assetVersionId: binding.assetVersionId, assetType: binding.assetType, role: binding.role },
        )
      }
      if (!Number.isSafeInteger(binding.position) || binding.position < 0) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_BINDING_INVALID',
          `Asset binding ${binding.assetVersionId} has an invalid position`,
          { position: binding.position },
        )
      }
      const slot = `${binding.role}:${binding.position}`
      if (slots.has(slot)) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_BINDING_INVALID',
          `Duplicate creative asset binding slot ${slot}`,
          { slot },
        )
      }
      slots.add(slot)
      return binding
    })
    .sort((left, right) => left.role.localeCompare(right.role) || left.position - right.position)
}

function selectReferences(bindings: readonly ApprovedCreativeAssetBindingInput[]): SelectedReference[] {
  const selected: SelectedReference[] = []
  const referenceIds = new Set<string>()
  for (const binding of bindings) {
    const referencesById = new Map<string, CreativeAssetCompilerReferenceInput>()
    for (const reference of binding.references) {
      if (referenceIds.has(reference.id) || referencesById.has(reference.id)) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_REFERENCE_SELECTION_INVALID',
          `Duplicate creative asset reference ${reference.id}`,
          { referenceId: reference.id },
        )
      }
      if (!CREATIVE_ASSET_COMPILER_MEDIA_KINDS.includes(reference.mediaKind)) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_REFERENCE_KIND_INVALID',
          `Unsupported creative reference media kind: ${reference.mediaKind}`,
          { referenceId: reference.id, mediaKind: reference.mediaKind },
        )
      }
      referencesById.set(reference.id, reference)
    }
    if (binding.referenceIds.length === 0) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_REFERENCE_SELECTION_INVALID',
        `Asset binding ${binding.assetVersionId} must select at least one reference`,
        { assetVersionId: binding.assetVersionId },
      )
    }
    const localIds = new Set<string>()
    for (const referenceId of binding.referenceIds) {
      if (localIds.has(referenceId)) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_REFERENCE_SELECTION_INVALID',
          `Reference ${referenceId} is selected more than once`,
          { referenceId },
        )
      }
      const reference = referencesById.get(referenceId)
      if (reference === undefined) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_REFERENCE_SELECTION_INVALID',
          `Reference ${referenceId} does not belong to asset version ${binding.assetVersionId}`,
          { referenceId, assetVersionId: binding.assetVersionId },
        )
      }
      localIds.add(referenceId)
      referenceIds.add(referenceId)
      selected.push({
        referenceId: reference.id,
        userAssetId: reference.userAssetId,
        mediaKind: reference.mediaKind,
        assetVersionId: binding.assetVersionId,
        role: binding.role,
      })
    }
    for (const reference of binding.references) {
      if (isCreativeAssetReferenceRoleCompatible(binding.assetType, reference.role ?? 'other') === false) {
        throw new CreativeAssetCompilerError(
          'CREATIVE_COMPILER_BINDING_INVALID',
          `Reference role ${reference.role} is incompatible with asset type ${binding.assetType}`,
          { referenceId: reference.id, assetType: binding.assetType, role: reference.role },
        )
      }
    }
  }
  return selected
}

function resolveMediaParameters(
  manifest: CreativeAssetCompilerManifest,
  references: readonly SelectedReference[],
  explicitParameterName: string | undefined,
): Map<string, SelectedReference[]> {
  const byKind = new Map<CreativeAssetCompilerMediaKind, SelectedReference[]>()
  for (const reference of references) {
    const items = byKind.get(reference.mediaKind) ?? []
    items.push(reference)
    byKind.set(reference.mediaKind, items)
  }

  const result = new Map<string, SelectedReference[]>()
  for (const [mediaKind, kindReferences] of byKind) {
    const candidates = mediaParameterNames(manifest).filter(parameterName => {
      const parameter = manifest.parameters.find(candidate => candidate.name === parameterName)
      return parameter?.mediaKind === mediaKind
    })
    const parameterName = explicitParameterName === undefined
      ? candidates.length === 1
        ? candidates[0]
        : candidates.length === 0
          ? undefined
          : (() => {
              throw new CreativeAssetCompilerError(
                'CREATIVE_COMPILER_MEDIA_PARAMETER_AMBIGUOUS',
                `Model ${manifest.id} has multiple ${mediaKind} media parameters; select one explicitly`,
                { mediaKind, candidates },
              )
            })()
      : explicitParameterName
    if (parameterName === undefined) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_MEDIA_PARAMETER_NOT_FOUND',
        `Model ${manifest.id} has no ${mediaKind} media parameter for creative references`,
        { mediaKind },
      )
    }
    const parameter = manifest.parameters.find(candidate => candidate.name === parameterName)
    if (parameter?.type !== 'media' || parameter.mediaKind !== mediaKind || bindingFor(manifest, parameterName)?.target !== 'input.media') {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_MEDIA_PARAMETER_NOT_FOUND',
        `Parameter ${parameterName} cannot receive ${mediaKind} creative references`,
        { parameterName, mediaKind },
      )
    }
    if (result.has(parameterName)) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_MEDIA_PARAMETER_AMBIGUOUS',
        `Creative references resolve to media parameter ${parameterName} more than once`,
        { parameterName },
      )
    }
    result.set(parameterName, kindReferences)
  }
  return result
}

function orderProviderReferences(
  mediaParameterByKind: ReadonlyMap<string, readonly SelectedReference[]>,
  manifest: CreativeAssetCompilerManifest,
): SelectedReferenceWithParameter[] {
  const byParameter = new Map<string, readonly SelectedReference[]>()
  for (const [parameterName, items] of mediaParameterByKind) byParameter.set(parameterName, items)
  return providerMediaParameterNames(manifest).flatMap(parameterName => (
    (byParameter.get(parameterName) ?? []).map(reference => ({ ...reference, parameterName }))
  ))
}

function providerMediaParameterNames(manifest: CreativeAssetCompilerManifest): string[] {
  return Object.entries(manifest.request.bindings)
    .filter(([parameterName]) => bindingFor(manifest, parameterName)?.target === 'input.media')
    .map(([parameterName]) => parameterName)
}

function mediaParameterNames(manifest: CreativeAssetCompilerManifest): string[] {
  const names = new Set(manifest.parameters
    .filter(parameter => parameter.type === 'media')
    .map(parameter => parameter.name))
  return providerMediaParameterNames(manifest).filter(name => names.has(name))
}

function bindingFor(manifest: CreativeAssetCompilerManifest, parameterName: string): ModelParameterBinding | undefined {
  const binding = manifest.request.bindings[parameterName]
  if (typeof binding !== 'object' || binding === null || !('target' in binding)) return undefined
  const record = binding as Record<string, unknown>
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

type ReferenceFormat = 'angle-bracket' | 'image-bracket' | 'chinese'

function referenceFormatFor(manifest: CreativeAssetCompilerManifest): ReferenceFormat {
  const format = manifest.request.referenceFormat
  return format === 'angle-bracket' || format === 'image-bracket' || format === 'chinese'
    ? format
    : 'angle-bracket'
}

function resolvePromptReferences(prompt: string, format: ReferenceFormat, referenceCount: number): string {
  return prompt.replace(/@图(\d+)/g, (match, rawIndex: string) => {
    const index = Number(rawIndex)
    if (!Number.isSafeInteger(index) || index < 1 || index > referenceCount) {
      throw new CreativeAssetCompilerError(
        'CREATIVE_COMPILER_PROMPT_REFERENCE_INVALID',
        `Prompt reference ${match} is outside the selected reference range`,
        { reference: match, referenceCount },
      )
    }
    return providerSyntaxFor(format, index)
  })
}

function providerSyntaxFor(format: ReferenceFormat, index: number): string {
  switch (format) {
    case 'angle-bracket':
      return `<<<image_${index}>>>`
    case 'image-bracket':
      return `[Image ${index}]`
    case 'chinese':
      return `图${index}`
  }
}

interface SelectedReference {
  referenceId: string
  userAssetId: string
  mediaKind: CreativeAssetCompilerMediaKind
  assetVersionId: string
  role: CreativeGenerationBindingInput['role']
}

interface SelectedReferenceWithParameter extends SelectedReference {
  parameterName: string
}

type CreativeGenerationBindingInput = ApprovedCreativeAssetBindingInput
