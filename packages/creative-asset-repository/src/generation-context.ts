import { createHash } from 'node:crypto'
import {
  CreativeGenerationContextSchema,
  normalizeCreativeGenerationContext,
  type CreativeGenerationContext,
} from '@bailian-studio/creative-asset-contracts'
import {
  creativeAssetReferences,
  creativeAssetVersions,
  creativeAssets,
  creativeGenerationContextAssets,
  creativeGenerationContextReferences,
  creativeGenerationContexts,
  creativeProjects,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
  userAssets,
} from '@bailian-studio/db'
import { asc, eq, inArray } from 'drizzle-orm'
import { CreativeAssetRepositoryError } from './errors'
import {
  nextCreativeGenerationContextAssetId,
  nextCreativeGenerationContextId,
  nextCreativeGenerationContextReferenceId,
} from './id'

export interface ValidateCreativeGenerationContextInput {
  tx: BailianStudioDbTransaction
  userId: string
  context?: CreativeGenerationContext
  allowDeleted?: boolean
}

export interface PersistCreativeGenerationContextInput {
  tx: BailianStudioDbTransaction
  generationId: string
  userId: string
  modelId: string
  context: CreativeGenerationContext
  createdAt: Date
}

export interface CreativeGenerationContextStore {
  /** 在 generation 的创建事务中锁定并校验资产域快照。 */
  validateForGeneration(input: ValidateCreativeGenerationContextInput): Promise<void>
  /** 在 generation 的创建事务中持久化创意资产上下文快照。 */
  persist(input: PersistCreativeGenerationContextInput): Promise<void>
  /** 读取 generation 的创意资产上下文，用于重跑和审计。 */
  read(input: {
    db: BailianStudioDb | BailianStudioDbTransaction
    generationId: string
  }): Promise<CreativeGenerationContext | undefined>
  /** 只读取幂等比较所需的指纹，避免生成域再次触碰上下文表。 */
  findFingerprint(input: {
    db: BailianStudioDb | BailianStudioDbTransaction
    generationId: string
  }): Promise<string | undefined>
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function fingerprintCreativeGenerationContext(
  context: CreativeGenerationContext,
): string {
  return createHash('sha256').update(canonicalize(context)).digest('hex')
}

function contextError(
  code:
    | 'CREATIVE_PROJECT_STATE_INVALID'
    | 'CREATIVE_ASSET_VERSION_STATE_INVALID'
    | 'CREATIVE_ASSET_REFERENCE_INVALID',
  message: string,
  field: string,
  details: Record<string, unknown> = {},
): never {
  throw new CreativeAssetRepositoryError(code, message, { field, ...details })
}

async function validateForGeneration(
  input: ValidateCreativeGenerationContextInput,
): Promise<void> {
  const context = input.context
  if (context === undefined) return

  if (context.projectId !== undefined) {
    const [project] = await input.tx
      .select({
        id: creativeProjects.id,
        userId: creativeProjects.userId,
        status: creativeProjects.status,
        deletedAt: creativeProjects.deletedAt,
      })
      .from(creativeProjects)
      .where(eq(creativeProjects.id, context.projectId))
      .for('update')

    if (
      project === undefined
      || project.userId !== input.userId
      || (!input.allowDeleted && project.deletedAt !== null)
      || (!input.allowDeleted && project.status === 'archived')
    ) {
      contextError(
        'CREATIVE_PROJECT_STATE_INVALID',
        'The selected creative project is unavailable',
        'projectId',
      )
    }
  }

  if (context.assetBindings.length === 0) return

  const assetVersionIds = [...new Set(context.assetBindings.map(binding => binding.assetVersionId))]
  const versionRows = await input.tx
    .select({
      assetVersionId: creativeAssetVersions.id,
      versionStatus: creativeAssetVersions.status,
      versionDeletedAt: creativeAssetVersions.deletedAt,
      assetType: creativeAssets.type,
      assetStatus: creativeAssets.status,
      assetUserId: creativeAssets.userId,
      assetDeletedAt: creativeAssets.deletedAt,
    })
    .from(creativeAssetVersions)
    .innerJoin(creativeAssets, eq(creativeAssets.id, creativeAssetVersions.assetId))
    .where(inArray(creativeAssetVersions.id, assetVersionIds))
    .orderBy(asc(creativeAssetVersions.id))
    .for('update')

  const versionsById = new Map(versionRows.map(row => [row.assetVersionId, row] as const))
  const candidateAllowed = context.purpose === 'asset_variant'
  for (const [index, binding] of context.assetBindings.entries()) {
    const version = versionsById.get(binding.assetVersionId)
    if (
      version === undefined
      || version.assetUserId !== input.userId
      || (!input.allowDeleted && version.assetDeletedAt !== null)
      || (!input.allowDeleted && version.assetStatus === 'archived')
      || (!input.allowDeleted && version.versionDeletedAt !== null)
      || (!candidateAllowed && version.versionStatus !== 'approved')
      || (candidateAllowed
        && version.versionStatus !== 'approved'
        && version.versionStatus !== 'candidate')
    ) {
      contextError(
        'CREATIVE_ASSET_VERSION_STATE_INVALID',
        'The selected creative asset version is unavailable or not approved',
        `assetBindings.${index}.assetVersionId`,
        { assetVersionId: binding.assetVersionId },
      )
    }
    if (version.assetType !== binding.role) {
      contextError(
        'CREATIVE_ASSET_VERSION_STATE_INVALID',
        `Asset version type '${version.assetType}' does not match binding role '${binding.role}'`,
        `assetBindings.${index}.role`,
        { assetType: version.assetType, role: binding.role },
      )
    }
  }

  const referenceIds = [
    ...new Set(context.assetBindings.flatMap(binding => binding.referenceIds)),
  ]
  if (referenceIds.length === 0) return

  const referenceRows = await input.tx
    .select({
      id: creativeAssetReferences.id,
      assetVersionId: creativeAssetReferences.assetVersionId,
      referenceDeletedAt: creativeAssetReferences.deletedAt,
      userAssetUserId: userAssets.userId,
      userAssetStatus: userAssets.status,
      userAssetDeletedAt: userAssets.deletedAt,
    })
    .from(creativeAssetReferences)
    .innerJoin(userAssets, eq(userAssets.id, creativeAssetReferences.userAssetId))
    .where(inArray(creativeAssetReferences.id, referenceIds))
    .orderBy(asc(creativeAssetReferences.id))
    .for('update')

  const referencesById = new Map(referenceRows.map(row => [row.id, row] as const))
  for (const [bindingIndex, binding] of context.assetBindings.entries()) {
    for (const [referenceIndex, referenceId] of binding.referenceIds.entries()) {
      const reference = referencesById.get(referenceId)
      if (
        reference === undefined
        || reference.assetVersionId !== binding.assetVersionId
        || (!input.allowDeleted && reference.referenceDeletedAt !== null)
        || reference.userAssetUserId !== input.userId
        || reference.userAssetStatus !== 'ready'
        || (!input.allowDeleted && reference.userAssetDeletedAt !== null)
      ) {
        contextError(
          'CREATIVE_ASSET_REFERENCE_INVALID',
          'The selected reference does not belong to the bound asset version',
          `assetBindings.${bindingIndex}.referenceIds.${referenceIndex}`,
          { referenceId },
        )
      }
    }
  }
}

async function persist(input: PersistCreativeGenerationContextInput): Promise<void> {
  const contextId = nextCreativeGenerationContextId()
  await input.tx.insert(creativeGenerationContexts).values({
    id: contextId,
    generationId: input.generationId,
    userId: input.userId,
    projectId: input.context.projectId ?? null,
    protocolVersion: input.context.protocolVersion,
    purpose: input.context.purpose,
    fingerprint: fingerprintCreativeGenerationContext(input.context),
    prompt: input.context.prompt,
    negativePrompt: input.context.negativePrompt ?? null,
    modelId: input.context.modelId ?? input.modelId,
    recipeJson: input.context.recipe,
    capabilitySnapshotJson: input.context.capabilitySnapshot,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })

  if (input.context.assetBindings.length === 0) return

  const contextAssetRows = input.context.assetBindings.map(binding => ({
    id: nextCreativeGenerationContextAssetId(),
    contextId,
    assetVersionId: binding.assetVersionId,
    role: binding.role,
    position: binding.position,
    createdAt: input.createdAt,
  }))
  await input.tx.insert(creativeGenerationContextAssets).values(contextAssetRows)

  const contextReferenceRows = input.context.assetBindings.flatMap((binding, index) => {
    const contextAssetId = contextAssetRows[index]?.id
    if (contextAssetId === undefined) return []
    return binding.referenceIds.map((referenceId, position) => ({
      id: nextCreativeGenerationContextReferenceId(),
      contextAssetId,
      assetVersionId: binding.assetVersionId,
      referenceId,
      position,
      createdAt: input.createdAt,
    }))
  })
  if (contextReferenceRows.length > 0) {
    await input.tx.insert(creativeGenerationContextReferences).values(contextReferenceRows)
  }
}

async function read(
  input: {
    db: BailianStudioDb | BailianStudioDbTransaction
    generationId: string
  },
): Promise<CreativeGenerationContext | undefined> {
  const [row] = await input.db
    .select()
    .from(creativeGenerationContexts)
    .where(eq(creativeGenerationContexts.generationId, input.generationId))
    .limit(1)
  if (row === undefined) return undefined
  if (row.protocolVersion !== 1) {
    throw new CreativeAssetRepositoryError(
      'CREATIVE_DATABASE_ERROR',
      `Unsupported creative asset protocol version ${row.protocolVersion}: ${row.id}`,
    )
  }

  const assetRows = await input.db
    .select({
      assetVersionId: creativeGenerationContextAssets.assetVersionId,
      role: creativeGenerationContextAssets.role,
      position: creativeGenerationContextAssets.position,
      contextAssetId: creativeGenerationContextAssets.id,
    })
    .from(creativeGenerationContextAssets)
    .where(eq(creativeGenerationContextAssets.contextId, row.id))
    .orderBy(
      asc(creativeGenerationContextAssets.role),
      asc(creativeGenerationContextAssets.position),
    )

  const referenceRows = assetRows.length === 0
    ? []
    : await input.db
      .select({
        contextAssetId: creativeGenerationContextReferences.contextAssetId,
        referenceId: creativeGenerationContextReferences.referenceId,
        position: creativeGenerationContextReferences.position,
      })
      .from(creativeGenerationContextReferences)
      .where(inArray(
        creativeGenerationContextReferences.contextAssetId,
        assetRows.map(asset => asset.contextAssetId),
      ))
      .orderBy(
        asc(creativeGenerationContextReferences.contextAssetId),
        asc(creativeGenerationContextReferences.position),
      )

  const referencesByContextAsset = new Map<string, Array<{ referenceId: string; position: number }>>()
  for (const reference of referenceRows) {
    const current = referencesByContextAsset.get(reference.contextAssetId) ?? []
    current.push({ referenceId: reference.referenceId, position: reference.position })
    referencesByContextAsset.set(reference.contextAssetId, current)
  }

  const context = {
    protocolVersion: 1 as const,
    purpose: row.purpose,
    prompt: row.prompt,
    ...(row.projectId !== null ? { projectId: row.projectId } : {}),
    ...(row.negativePrompt !== null ? { negativePrompt: row.negativePrompt } : {}),
    ...(row.modelId !== null ? { modelId: row.modelId } : {}),
    assetBindings: assetRows.map(asset => ({
      assetVersionId: asset.assetVersionId,
      role: asset.role,
      position: asset.position,
      referenceIds: (referencesByContextAsset.get(asset.contextAssetId) ?? [])
        .sort((left, right) => left.position - right.position)
        .map(reference => reference.referenceId),
    })),
    recipe: row.recipeJson,
    capabilitySnapshot: row.capabilitySnapshotJson,
  }
  const parsed = CreativeGenerationContextSchema.safeParse(context)
  if (!parsed.success) {
    throw new CreativeAssetRepositoryError(
      'CREATIVE_DATABASE_ERROR',
      `Invalid creative asset context ${row.id}: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    )
  }
  return normalizeCreativeGenerationContext(parsed.data)
}

async function findFingerprint(
  input: {
    db: BailianStudioDb | BailianStudioDbTransaction
    generationId: string
  },
): Promise<string | undefined> {
  const [row] = await input.db
    .select({ fingerprint: creativeGenerationContexts.fingerprint })
    .from(creativeGenerationContexts)
    .where(eq(creativeGenerationContexts.generationId, input.generationId))
    .limit(1)
  return row?.fingerprint
}

export function createCreativeGenerationContextStore(): CreativeGenerationContextStore {
  return {
    validateForGeneration,
    persist,
    read,
    findFingerprint,
  }
}
