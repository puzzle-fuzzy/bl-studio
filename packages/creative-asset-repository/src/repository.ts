import {
  creativeAssetReferences,
  creativeAssetVersions,
  creativeAssets,
  creativeProjectAssets,
  creativeProjects,
  assetDerivatives,
  generationArtifacts,
  generationRecords,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
  userAssets,
} from '@bailian-studio/db'
import {
  isCreativeAssetReferenceRoleCompatible,
  type CreativeAssetStatus,
  type CreativeAssetType,
  type CreativeAssetVersionStatus,
  type CreativeProjectStatus,
} from '@bailian-studio/creative-asset-contracts'
import { and, asc, desc, eq, exists, gt, ilike, inArray, isNull, ne, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { CreativeAssetRepositoryError } from './errors'
import {
  nextCreativeAssetId,
  nextCreativeAssetReferenceId,
  nextCreativeAssetVersionId,
  nextCreativeProjectAssetId,
  nextCreativeProjectId,
} from './id'
import type {
  CreativeAssetDetail,
  CreativeAssetPreviewSource,
  CreativeAssetReference,
  CreativeAssetRepository,
  CreativeAssetSummary,
  CreativeAssetVersion,
  CreateCreativeAssetVersionFromGenerationRepositoryInput,
  RemoveCreativeAssetReferenceRepositoryInput,
  CreativeProject,
  CreativeProjectAssetMembership,
  CreativeProjectDetail,
  ListCreativeAssetsResult,
  ListCreativeProjectsResult,
  ResolveCreativeGenerationBindingsRepositoryInput,
  ResolvedCreativeGenerationBinding,
} from './types'

interface Cursor {
  createdAt: string
  id: string
}

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 100
const latestAssetVersion = alias(creativeAssetVersions, 'latest_creative_asset_version')
const newerAssetVersion = alias(creativeAssetVersions, 'newer_creative_asset_version')

function nowDate(value?: string): Date {
  const date = value === undefined ? new Date() : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Invalid timestamp')
  }
  return date
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function nextCursorForRow(row: { createdAt: Date; id: string } | undefined): string | undefined {
  return row === undefined ? undefined : encodeCursor({ createdAt: row.createdAt.toISOString(), id: row.id })
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid cursor')
    const candidate = parsed as { createdAt?: unknown; id?: unknown }
    if (typeof candidate.createdAt !== 'string' || typeof candidate.id !== 'string') throw new Error('invalid cursor')
    if (!Number.isFinite(Date.parse(candidate.createdAt)) || candidate.id.length === 0) throw new Error('invalid cursor')
    return { createdAt: candidate.createdAt, id: candidate.id }
  } catch {
    throw new CreativeAssetRepositoryError('CREATIVE_INVALID_CURSOR', 'Invalid creative asset cursor')
  }
}

function limitValue(value?: number): number {
  if (value === undefined) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)))
}

function toProject(row: typeof creativeProjects.$inferSelect): CreativeProject {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    status: row.status as CreativeProjectStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toMembership(row: typeof creativeProjectAssets.$inferSelect): CreativeProjectAssetMembership {
  return {
    id: row.id,
    projectId: row.projectId,
    assetId: row.assetId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mediaKindForPreview(kind: string): CreativeAssetPreviewSource['kind'] | undefined {
  return kind === 'image' || kind === 'video' || kind === 'audio' ? kind : undefined
}

function toPreviewSource(input: {
  userAssetId: string
  kind: string
  originalUrl: string | null
  storageUrl: string | null
  storageProvider: string | null
  storageKey: string | null
  thumbnailStatus: string | null
  thumbnailStorageProvider: string | null
  thumbnailStorageKey: string | null
}): CreativeAssetPreviewSource | undefined {
  const kind = mediaKindForPreview(input.kind)
  if (kind === undefined) return undefined
  return {
    userAssetId: input.userAssetId,
    kind,
    ...(input.originalUrl !== null ? { originalUrl: input.originalUrl } : {}),
    ...(input.storageUrl !== null ? { storageUrl: input.storageUrl } : {}),
    ...(input.storageProvider !== null ? { storageProvider: input.storageProvider } : {}),
    ...(input.storageKey !== null ? { storageKey: input.storageKey } : {}),
    ...(input.thumbnailStatus !== null ? { thumbnailStatus: input.thumbnailStatus as CreativeAssetPreviewSource['thumbnailStatus'] } : {}),
    ...(input.thumbnailStorageProvider !== null ? { thumbnailStorageProvider: input.thumbnailStorageProvider } : {}),
    ...(input.thumbnailStorageKey !== null ? { thumbnailStorageKey: input.thumbnailStorageKey } : {}),
  }
}

function toReference(
  row: typeof creativeAssetReferences.$inferSelect,
  previewSource?: CreativeAssetPreviewSource,
): CreativeAssetReference {
  return {
    id: row.id,
    assetVersionId: row.assetVersionId,
    userAssetId: row.userAssetId,
    role: row.role as CreativeAssetReference['role'],
    position: row.position,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(previewSource === undefined ? {} : { previewSource }),
  }
}

function toVersion(
  row: typeof creativeAssetVersions.$inferSelect,
  references: CreativeAssetReference[],
): CreativeAssetVersion {
  return {
    id: row.id,
    assetId: row.assetId,
    ...(row.sourceGenerationId !== null ? { sourceGenerationId: row.sourceGenerationId } : {}),
    version: row.version,
    status: row.status as CreativeAssetVersionStatus,
    semanticSpec: row.semanticSpecJson,
    generationRecipe: row.generationRecipeJson,
    ...(row.notes !== null ? { notes: row.notes } : {}),
    references,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type VersionSummary = Pick<typeof creativeAssetVersions.$inferSelect, 'id' | 'assetId' | 'version' | 'status'>

function summarizeVersions(rows: VersionSummary[]): Map<string, { latestVersion?: VersionSummary; approvedVersionId?: string }> {
  const result = new Map<string, { latestVersion?: VersionSummary; approvedVersionId?: string }>()
  for (const row of rows) {
    const current = result.get(row.assetId) ?? {}
    if (current.latestVersion === undefined || row.version > current.latestVersion.version) {
      current.latestVersion = row
    }
    if (row.status === 'approved') current.approvedVersionId = row.id
    result.set(row.assetId, current)
  }
  return result
}

function toSummary(
  row: typeof creativeAssets.$inferSelect,
  versionSummary?: { latestVersion?: VersionSummary; approvedVersionId?: string },
  previewSource?: CreativeAssetPreviewSource,
): CreativeAssetSummary {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CreativeAssetSummary['type'],
    name: row.name,
    description: row.description,
    status: row.status as CreativeAssetStatus,
    metadata: row.metadataJson,
    ...(versionSummary?.latestVersion !== undefined
      ? {
          latestVersion: {
            id: versionSummary.latestVersion.id,
            version: versionSummary.latestVersion.version,
            status: versionSummary.latestVersion.status as CreativeAssetVersionStatus,
          },
        }
      : {}),
    ...(versionSummary?.approvedVersionId !== undefined ? { approvedVersionId: versionSummary.approvedVersionId } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(previewSource === undefined ? {} : { previewSource }),
  }
}

async function summariesForRows(
  db: BailianStudioDb | BailianStudioDbTransaction,
  rows: Array<typeof creativeAssets.$inferSelect>,
): Promise<CreativeAssetSummary[]> {
  if (rows.length === 0) return []
  const versionRows = await db
    .select({
      id: creativeAssetVersions.id,
      assetId: creativeAssetVersions.assetId,
      version: creativeAssetVersions.version,
      status: creativeAssetVersions.status,
    })
    .from(creativeAssetVersions)
    .where(and(
      inArray(creativeAssetVersions.assetId, rows.map(row => row.id)),
      isNull(creativeAssetVersions.deletedAt),
    ))
    .orderBy(desc(creativeAssetVersions.version), desc(creativeAssetVersions.createdAt))
  const summaries = summarizeVersions(versionRows)
  const previewRows = await db
    .select({
      assetId: creativeAssetVersions.assetId,
      versionStatus: creativeAssetVersions.status,
      version: creativeAssetVersions.version,
      role: creativeAssetReferences.role,
      position: creativeAssetReferences.position,
      userAssetId: userAssets.id,
      kind: userAssets.kind,
      originalUrl: userAssets.originalUrl,
      storageUrl: userAssets.storageUrl,
      storageProvider: userAssets.storageProvider,
      storageKey: userAssets.storageKey,
      thumbnailStatus: assetDerivatives.status,
      thumbnailStorageProvider: assetDerivatives.storageProvider,
      thumbnailStorageKey: assetDerivatives.storageKey,
    })
    .from(creativeAssetVersions)
    .innerJoin(creativeAssetReferences, eq(creativeAssetReferences.assetVersionId, creativeAssetVersions.id))
    .innerJoin(userAssets, eq(userAssets.id, creativeAssetReferences.userAssetId))
    .leftJoin(assetDerivatives, and(
      eq(assetDerivatives.assetId, userAssets.id),
      eq(assetDerivatives.kind, 'thumbnail'),
      isNull(assetDerivatives.deletedAt),
    ))
    .where(and(
      inArray(creativeAssetVersions.assetId, rows.map(row => row.id)),
      isNull(creativeAssetVersions.deletedAt),
      isNull(creativeAssetReferences.deletedAt),
      eq(userAssets.status, 'ready'),
      isNull(userAssets.deletedAt),
    ))
    .orderBy(
      asc(sql`case when ${creativeAssetVersions.status} = 'approved' then 0 else 1 end`),
      desc(creativeAssetVersions.version),
      asc(creativeAssetReferences.role),
      asc(creativeAssetReferences.position),
    )
  const previewSources = new Map<string, CreativeAssetPreviewSource>()
  for (const row of previewRows) {
    if (previewSources.has(row.assetId)) continue
    const previewSource = toPreviewSource(row)
    if (previewSource !== undefined) previewSources.set(row.assetId, previewSource)
  }
  return rows.map(row => toSummary(row, summaries.get(row.id), previewSources.get(row.id)))
}

async function ownedProject(
  db: BailianStudioDb | BailianStudioDbTransaction,
  userId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<typeof creativeProjects.$inferSelect> {
  const [project] = await db
    .select()
    .from(creativeProjects)
    .where(and(
      eq(creativeProjects.id, projectId),
      eq(creativeProjects.userId, userId),
      isNull(creativeProjects.deletedAt),
    ))
    .limit(1)
  if (project === undefined) {
    throw new CreativeAssetRepositoryError('CREATIVE_PROJECT_NOT_FOUND', `Creative project not found: ${projectId}`)
  }
  if (options.includeArchived !== true && project.status === 'archived') {
    throw new CreativeAssetRepositoryError('CREATIVE_PROJECT_STATE_INVALID', `Creative project is archived: ${projectId}`)
  }
  return project
}

async function ownedAsset(
  db: BailianStudioDb | BailianStudioDbTransaction,
  userId: string,
  assetId: string,
): Promise<typeof creativeAssets.$inferSelect> {
  const [asset] = await db
    .select()
    .from(creativeAssets)
    .where(and(
      eq(creativeAssets.id, assetId),
      eq(creativeAssets.userId, userId),
      isNull(creativeAssets.deletedAt),
    ))
    .limit(1)
  if (asset === undefined) {
    throw new CreativeAssetRepositoryError('CREATIVE_ASSET_NOT_FOUND', `Creative asset not found: ${assetId}`)
  }
  return asset
}

async function assetDetail(
  db: BailianStudioDb | BailianStudioDbTransaction,
  userId: string,
  assetId: string,
): Promise<CreativeAssetDetail> {
  const asset = await ownedAsset(db, userId, assetId)
  const memberships = await db
    .select()
    .from(creativeProjectAssets)
    .innerJoin(creativeProjects, eq(creativeProjectAssets.projectId, creativeProjects.id))
    .where(and(
      eq(creativeProjectAssets.assetId, asset.id),
      eq(creativeProjects.userId, userId),
      isNull(creativeProjectAssets.deletedAt),
      isNull(creativeProjects.deletedAt),
    ))
    .orderBy(asc(creativeProjectAssets.sortOrder), asc(creativeProjects.createdAt))
  const versionRows = await db
    .select()
    .from(creativeAssetVersions)
    .where(and(
      eq(creativeAssetVersions.assetId, asset.id),
      isNull(creativeAssetVersions.deletedAt),
    ))
    .orderBy(desc(creativeAssetVersions.version))
  const references = versionRows.length === 0
    ? []
    : await db
      .select({
        reference: creativeAssetReferences,
        userAsset: userAssets,
        thumbnail: assetDerivatives,
      })
      .from(creativeAssetReferences)
      .innerJoin(userAssets, eq(userAssets.id, creativeAssetReferences.userAssetId))
      .leftJoin(assetDerivatives, and(
        eq(assetDerivatives.assetId, userAssets.id),
        eq(assetDerivatives.kind, 'thumbnail'),
        isNull(assetDerivatives.deletedAt),
      ))
      .where(and(
        inArray(creativeAssetReferences.assetVersionId, versionRows.map(row => row.id)),
        isNull(creativeAssetReferences.deletedAt),
      ))
      .orderBy(asc(creativeAssetReferences.assetVersionId), asc(creativeAssetReferences.role), asc(creativeAssetReferences.position))
  const referencesByVersion = new Map<string, CreativeAssetReference[]>()
  for (const row of references) {
    const current = referencesByVersion.get(row.reference.assetVersionId) ?? []
    current.push(toReference(row.reference, row.userAsset.status === 'ready' && row.userAsset.deletedAt === null
      ? toPreviewSource({
          userAssetId: row.userAsset.id,
          kind: row.userAsset.kind,
          originalUrl: row.userAsset.originalUrl,
          storageUrl: row.userAsset.storageUrl,
          storageProvider: row.userAsset.storageProvider,
          storageKey: row.userAsset.storageKey,
          thumbnailStatus: row.thumbnail?.status ?? null,
          thumbnailStorageProvider: row.thumbnail?.storageProvider ?? null,
          thumbnailStorageKey: row.thumbnail?.storageKey ?? null,
        })
      : undefined))
    referencesByVersion.set(row.reference.assetVersionId, current)
  }
  const versions = versionRows.map(row => toVersion(row, referencesByVersion.get(row.id) ?? []))
  const latestVersion = versionRows[0]
  const preferredVersion = [...versionRows].sort((left, right) => {
    if (left.status === 'approved' && right.status !== 'approved') return -1
    if (right.status === 'approved' && left.status !== 'approved') return 1
    return right.version - left.version
  })[0]
  const preferredPreview = preferredVersion === undefined
    ? undefined
    : referencesByVersion.get(preferredVersion.id)?.find(reference => reference.previewSource !== undefined)?.previewSource
  const summary = toSummary(asset, {
    ...(latestVersion !== undefined ? { latestVersion } : {}),
    ...(versionRows.find(row => row.status === 'approved')?.id !== undefined
      ? { approvedVersionId: versionRows.find(row => row.status === 'approved')?.id }
      : {}),
  }, preferredPreview)
  return {
    ...summary,
    projects: memberships.map(row => toMembership(row.creative_project_assets)),
    versions,
  }
}

async function projectDetail(
  db: BailianStudioDb | BailianStudioDbTransaction,
  project: typeof creativeProjects.$inferSelect,
): Promise<CreativeProjectDetail> {
  const rows = await db
    .select({ asset: creativeAssets })
    .from(creativeProjectAssets)
    .innerJoin(creativeAssets, eq(creativeProjectAssets.assetId, creativeAssets.id))
    .where(and(
      eq(creativeProjectAssets.projectId, project.id),
      isNull(creativeProjectAssets.deletedAt),
      isNull(creativeAssets.deletedAt),
    ))
    .orderBy(asc(creativeProjectAssets.sortOrder), asc(creativeAssets.createdAt), asc(creativeAssets.id))
  return {
    ...toProject(project),
    assets: await summariesForRows(db, rows.map(row => row.asset)),
  }
}

function mediaKindForUserAsset(kind: string): 'image' | 'video' | 'audio' | undefined {
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind
  return undefined
}

/**
 * 解析一次生成上下文中的资产绑定，输出 compiler 的最小输入。
 *
 * 这里不持有跨请求的快照，也不替代 generation repository 的最终事务校验：
 * 版本/引用可能在本次查询后被归档，因此 createGeneration 仍必须在自己的事务
 * 中 FOR UPDATE 再检查一次。这个方法的职责是消除 API 层对 DB 表结构的依赖，
 * 并把 owner、project、approved version 和 ready reference 的判断集中在资产域。
 */
async function resolveGenerationBindings(
  db: BailianStudioDb,
  input: ResolveCreativeGenerationBindingsRepositoryInput,
): Promise<ResolvedCreativeGenerationBinding[]> {
  if (input.context.projectId !== undefined) {
    await ownedProject(db, input.userId, input.context.projectId)
  }
  if (input.context.assetBindings.length === 0) return []

  const versionIds = [...new Set(input.context.assetBindings.map(binding => binding.assetVersionId))]
  const versionRows = await db
    .select({
      assetVersionId: creativeAssetVersions.id,
      assetVersionStatus: creativeAssetVersions.status,
      assetVersionDeletedAt: creativeAssetVersions.deletedAt,
      assetType: creativeAssets.type,
      assetStatus: creativeAssets.status,
      assetUserId: creativeAssets.userId,
      assetDeletedAt: creativeAssets.deletedAt,
    })
    .from(creativeAssetVersions)
    .innerJoin(creativeAssets, eq(creativeAssets.id, creativeAssetVersions.assetId))
    .where(inArray(creativeAssetVersions.id, versionIds))

  const versionsById = new Map(versionRows.map(row => [row.assetVersionId, row] as const))
  const bindingsWithVersion = input.context.assetBindings.map((binding, index) => {
    const version = versionsById.get(binding.assetVersionId)
    if (
      version === undefined
      || version.assetUserId !== input.userId
      || version.assetVersionStatus !== 'approved'
      || version.assetVersionDeletedAt !== null
      || version.assetStatus === 'archived'
      || version.assetDeletedAt !== null
    ) {
      throw new CreativeAssetRepositoryError(
        'CREATIVE_ASSET_VERSION_STATE_INVALID',
        `The selected creative asset version is unavailable or not approved: ${binding.assetVersionId}`,
        { field: `assetBindings.${index}.assetVersionId`, assetVersionId: binding.assetVersionId },
      )
    }
    if (version.assetType !== binding.role) {
      throw new CreativeAssetRepositoryError(
        'CREATIVE_ASSET_REFERENCE_INVALID',
        `Asset type '${version.assetType}' does not match binding role '${binding.role}'`,
        { field: `assetBindings.${index}.role`, assetType: version.assetType, role: binding.role },
      )
    }
    return { binding, version }
  })

  const referenceIds = [...new Set(input.context.assetBindings.flatMap(binding => binding.referenceIds))]
  const referenceRows = referenceIds.length === 0
    ? []
    : await db
      .select({
        id: creativeAssetReferences.id,
        assetVersionId: creativeAssetReferences.assetVersionId,
        role: creativeAssetReferences.role,
        referenceDeletedAt: creativeAssetReferences.deletedAt,
        userAssetId: userAssets.id,
        userAssetUserId: userAssets.userId,
        userAssetKind: userAssets.kind,
        userAssetStatus: userAssets.status,
        userAssetDeletedAt: userAssets.deletedAt,
      })
      .from(creativeAssetReferences)
      .innerJoin(userAssets, eq(userAssets.id, creativeAssetReferences.userAssetId))
      .where(inArray(creativeAssetReferences.id, referenceIds))

  const referencesById = new Map(referenceRows.map(row => [row.id, row] as const))
  return bindingsWithVersion.map(({ binding, version }, bindingIndex) => {
    const references = binding.referenceIds.map((referenceId, referenceIndex) => {
      const reference = referencesById.get(referenceId)
      const mediaKind = reference === undefined ? undefined : mediaKindForUserAsset(reference.userAssetKind)
      if (
        reference === undefined
        || reference.assetVersionId !== binding.assetVersionId
        || reference.referenceDeletedAt !== null
        || reference.userAssetUserId !== input.userId
        || reference.userAssetStatus !== 'ready'
        || reference.userAssetDeletedAt !== null
        || mediaKind === undefined
      ) {
        throw new CreativeAssetRepositoryError(
          'CREATIVE_ASSET_REFERENCE_INVALID',
          `The selected reference is unavailable: ${referenceId}`,
          { field: `assetBindings.${bindingIndex}.referenceIds.${referenceIndex}`, referenceId },
        )
      }
      return {
        id: reference.id,
        userAssetId: reference.userAssetId,
        mediaKind,
        role: reference.role as ResolvedCreativeGenerationBinding['references'][number]['role'],
      }
    })
    return {
      assetVersionId: binding.assetVersionId,
      assetVersionStatus: version.assetVersionStatus as ResolvedCreativeGenerationBinding['assetVersionStatus'],
      assetType: version.assetType as CreativeAssetType,
      role: binding.role,
      position: binding.position,
      referenceIds: [...binding.referenceIds],
      references,
    }
  })
}

async function attachAssetInTransaction(
  tx: BailianStudioDbTransaction,
  input: { userId: string; projectId: string; assetId: string; sortOrder: number; now: Date },
): Promise<void> {
  const project = await ownedProject(tx, input.userId, input.projectId)
  const asset = await ownedAsset(tx, input.userId, input.assetId)
  const [existing] = await tx
    .select()
    .from(creativeProjectAssets)
    .where(and(
      eq(creativeProjectAssets.projectId, project.id),
      eq(creativeProjectAssets.assetId, asset.id),
    ))
    .limit(1)
  if (existing?.deletedAt === null) {
    throw new CreativeAssetRepositoryError('CREATIVE_ASSET_ALREADY_ATTACHED', `Creative asset is already in project: ${asset.id}`)
  }
  if (existing !== undefined) {
    await tx
      .update(creativeProjectAssets)
      .set({
        sortOrder: input.sortOrder,
        deletedAt: null,
        deletedBy: null,
        updatedBy: input.userId,
        updatedAt: input.now,
      })
      .where(eq(creativeProjectAssets.id, existing.id))
    return
  }
  await tx.insert(creativeProjectAssets).values({
    id: nextCreativeProjectAssetId(),
    projectId: project.id,
    assetId: asset.id,
    sortOrder: input.sortOrder,
    createdBy: input.userId,
    updatedBy: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

function assertVersionTransition(from: CreativeAssetVersionStatus, to: CreativeAssetVersionStatus): void {
  const allowed: Record<CreativeAssetVersionStatus, readonly CreativeAssetVersionStatus[]> = {
    draft: ['generating', 'candidate', 'archived'],
    generating: ['candidate', 'rejected'],
    candidate: ['approved', 'rejected', 'archived'],
    approved: ['archived'],
    archived: [],
    rejected: [],
  }
  if (from === to || allowed[from].includes(to)) return
  throw new CreativeAssetRepositoryError(
    'CREATIVE_ASSET_VERSION_STATE_INVALID',
    `Invalid creative asset version transition: ${from} -> ${to}`,
  )
}

async function createVersionFromGeneration(
  db: BailianStudioDb,
  input: CreateCreativeAssetVersionFromGenerationRepositoryInput,
): Promise<CreativeAssetDetail> {
  const now = nowDate(input.now)
  await db.transaction(async tx => {
    const [asset] = await tx
      .select()
      .from(creativeAssets)
      .where(and(
        eq(creativeAssets.id, input.assetId),
        eq(creativeAssets.userId, input.userId),
        isNull(creativeAssets.deletedAt),
      ))
      .limit(1)
      .for('update')
    if (asset === undefined) {
      throw new CreativeAssetRepositoryError('CREATIVE_ASSET_NOT_FOUND', `Creative asset not found: ${input.assetId}`)
    }
    if (asset.status === 'archived') {
      throw new CreativeAssetRepositoryError('CREATIVE_ASSET_STATUS_INVALID', `Creative asset is archived: ${input.assetId}`)
    }

    const [generation] = await tx
      .select({ id: generationRecords.id, status: generationRecords.status })
      .from(generationRecords)
      .where(and(
        eq(generationRecords.id, input.sourceGenerationId),
        eq(generationRecords.userId, input.userId),
        isNull(generationRecords.deletedAt),
      ))
      .limit(1)
    if (generation === undefined) {
      throw new CreativeAssetRepositoryError('CREATIVE_ASSET_REFERENCE_INVALID', `Source generation not found: ${input.sourceGenerationId}`)
    }
    if (generation.status !== 'succeeded') {
      throw new CreativeAssetRepositoryError(
        'CREATIVE_ASSET_VERSION_STATE_INVALID',
        `Only succeeded generations can be collected: ${input.sourceGenerationId}`,
      )
    }

    const artifactRows = await tx
      .select({ artifact: generationArtifacts, userAsset: userAssets })
      .from(generationArtifacts)
      .innerJoin(userAssets, eq(userAssets.generationArtifactId, generationArtifacts.id))
      .where(and(
        inArray(generationArtifacts.id, input.references.map(reference => reference.artifactId)),
        eq(generationArtifacts.recordId, input.sourceGenerationId),
        eq(generationArtifacts.userId, input.userId),
        eq(generationArtifacts.status, 'stored'),
        isNull(generationArtifacts.deletedAt),
        eq(userAssets.userId, input.userId),
        eq(userAssets.status, 'ready'),
        isNull(userAssets.deletedAt),
      ))
    const artifactsById = new Map(artifactRows.map(row => [row.artifact.id, row] as const))
    const resolvedReferences = input.references.map((reference, index) => {
      const row = artifactsById.get(reference.artifactId)
      if (row === undefined || row.artifact.kind !== 'image' || row.userAsset.kind !== 'image') {
        throw new CreativeAssetRepositoryError(
          'CREATIVE_ASSET_REFERENCE_INVALID',
          `Generation artifact is not an available image: ${reference.artifactId}`,
          { field: `references.${index}.artifactId`, artifactId: reference.artifactId },
        )
      }
      if (!isCreativeAssetReferenceRoleCompatible(asset.type as CreativeAssetType, reference.role)) {
        throw new CreativeAssetRepositoryError(
          'CREATIVE_ASSET_REFERENCE_INVALID',
          `Reference role '${reference.role}' is incompatible with asset type '${asset.type}'`,
          { field: `references.${index}.role`, assetType: asset.type, role: reference.role },
        )
      }
      return { reference, row }
    })

    const [latest] = await tx
      .select({ version: creativeAssetVersions.version })
      .from(creativeAssetVersions)
      .where(and(eq(creativeAssetVersions.assetId, asset.id), isNull(creativeAssetVersions.deletedAt)))
      .orderBy(desc(creativeAssetVersions.version))
      .limit(1)
      .for('update')
    const versionId = nextCreativeAssetVersionId()
    await tx.insert(creativeAssetVersions).values({
      id: versionId,
      assetId: asset.id,
      sourceGenerationId: input.sourceGenerationId,
      version: (latest?.version ?? 0) + 1,
      status: 'draft',
      semanticSpecJson: input.semanticSpec,
      generationRecipeJson: input.generationRecipe,
      notes: input.notes ?? null,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(creativeAssetReferences).values(resolvedReferences.map(({ reference, row }) => ({
      id: nextCreativeAssetReferenceId(),
      assetVersionId: versionId,
      userAssetId: row.userAsset.id,
      role: reference.role,
      position: reference.position,
      metadataJson: reference.metadata,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: now,
      updatedAt: now,
    })))
  })
  return assetDetail(db, input.userId, input.assetId)
}

export function createCreativeAssetRepository({ db }: { db: BailianStudioDb }): CreativeAssetRepository {
  return {
    async createProject(input) {
      const now = nowDate(input.now)
      const projectId = nextCreativeProjectId()
      await db.insert(creativeProjects).values({
        id: projectId,
        userId: input.userId,
        title: input.title,
        description: input.description ?? null,
        status: 'draft',
        createdBy: input.userId,
        updatedBy: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      const project = await ownedProject(db, input.userId, projectId)
      return projectDetail(db, project)
    },

    async listProjects(input): Promise<ListCreativeProjectsResult> {
      const limit = limitValue(input.limit)
      const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor)
      const cursorDate = cursor === undefined ? undefined : new Date(cursor.createdAt)
      const conditions = [
        eq(creativeProjects.userId, input.userId),
        isNull(creativeProjects.deletedAt),
        ...(input.query === undefined || input.query.length === 0 ? [] : [ilike(creativeProjects.title, `%${input.query}%`)]),
        ...(cursorDate === undefined || cursor === undefined
          ? []
          : [sql`(${creativeProjects.createdAt} < ${cursorDate} or (${creativeProjects.createdAt} = ${cursorDate} and ${creativeProjects.id} < ${cursor.id}))`]),
      ]
      const rows = await db
        .select()
        .from(creativeProjects)
        .where(and(...conditions))
        .orderBy(desc(creativeProjects.createdAt), desc(creativeProjects.id))
        .limit(limit + 1)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore ? nextCursorForRow(items.at(-1)) : undefined
      return {
        items: items.map(toProject),
        ...(nextCursor === undefined ? {} : { nextCursor }),
      }
    },

    async getProject(input) {
      const [project] = await db
        .select()
        .from(creativeProjects)
        .where(and(
          eq(creativeProjects.id, input.projectId),
          eq(creativeProjects.userId, input.userId),
          isNull(creativeProjects.deletedAt),
        ))
        .limit(1)
      return project === undefined ? undefined : projectDetail(db, project)
    },

    async updateProject(input) {
      const now = nowDate(input.now)
      const project = await ownedProject(db, input.userId, input.projectId, { includeArchived: true })
      if (input.patch.status === 'active' && project.status === 'archived') {
        // 归档项目可以由用户显式恢复为 active；不会自动恢复已删除关系。
      }
      const [updated] = await db
        .update(creativeProjects)
        .set({
          ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
          ...(input.patch.description !== undefined ? { description: input.patch.description } : {}),
          ...(input.patch.status !== undefined ? { status: input.patch.status } : {}),
          updatedBy: input.userId,
          updatedAt: now,
        })
        .where(and(eq(creativeProjects.id, project.id), eq(creativeProjects.userId, input.userId), isNull(creativeProjects.deletedAt)))
        .returning()
      if (updated === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Creative project could not be updated')
      return projectDetail(db, updated)
    },

    async createAsset(input) {
      const now = nowDate(input.now)
      const assetId = nextCreativeAssetId()
      await db.transaction(async tx => {
        if (input.projectId !== undefined) await ownedProject(tx, input.userId, input.projectId)
        await tx.insert(creativeAssets).values({
          id: assetId,
          userId: input.userId,
          type: input.type,
          name: input.name,
          description: input.description ?? '',
          status: 'draft',
          metadataJson: input.metadata ?? {},
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        })
        if (input.projectId !== undefined) {
          await attachAssetInTransaction(tx, {
            userId: input.userId,
            projectId: input.projectId,
            assetId,
            sortOrder: 0,
            now,
          })
        }
      })
      return assetDetail(db, input.userId, assetId)
    },

    async listAssets(input): Promise<ListCreativeAssetsResult> {
      const limit = limitValue(input.limit)
      const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor)
      const cursorDate = cursor === undefined ? undefined : new Date(cursor.createdAt)
      const latestVersionStatusCondition = input.versionStatus === undefined
        ? []
        : [exists(
            db
              .select({ id: latestAssetVersion.id })
              .from(latestAssetVersion)
              .where(and(
                eq(latestAssetVersion.assetId, creativeAssets.id),
                eq(latestAssetVersion.status, input.versionStatus),
                isNull(latestAssetVersion.deletedAt),
                notExists(
                  db
                    .select({ id: newerAssetVersion.id })
                    .from(newerAssetVersion)
                    .where(and(
                      eq(newerAssetVersion.assetId, latestAssetVersion.assetId),
                      gt(newerAssetVersion.version, latestAssetVersion.version),
                      isNull(newerAssetVersion.deletedAt),
                    )),
                ),
              )),
          )]
      const conditions = [
        eq(creativeAssets.userId, input.userId),
        isNull(creativeAssets.deletedAt),
        ...(input.type === undefined ? [] : [eq(creativeAssets.type, input.type)]),
        ...latestVersionStatusCondition,
        ...(input.query === undefined || input.query.length === 0 ? [] : [ilike(creativeAssets.name, `%${input.query}%`)]),
        ...(input.projectId === undefined
          ? []
          : [
              eq(creativeProjectAssets.projectId, input.projectId),
              isNull(creativeProjectAssets.deletedAt),
              isNull(creativeProjects.deletedAt),
              eq(creativeProjects.userId, input.userId),
            ]),
        ...(cursorDate === undefined || cursor === undefined
          ? []
          : [sql`(${creativeAssets.createdAt} < ${cursorDate} or (${creativeAssets.createdAt} = ${cursorDate} and ${creativeAssets.id} < ${cursor.id}))`]),
      ]
      const rows = input.projectId === undefined
        ? await db
            .select()
            .from(creativeAssets)
            .where(and(...conditions))
            .orderBy(desc(creativeAssets.createdAt), desc(creativeAssets.id))
            .limit(limit + 1)
        : (await db
            .select({ asset: creativeAssets })
            .from(creativeAssets)
            .innerJoin(creativeProjectAssets, eq(creativeAssets.id, creativeProjectAssets.assetId))
            .innerJoin(creativeProjects, eq(creativeProjectAssets.projectId, creativeProjects.id))
            .where(and(...conditions))
            .orderBy(desc(creativeAssets.createdAt), desc(creativeAssets.id))
            .limit(limit + 1)).map(row => row.asset)
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const summaries = await summariesForRows(db, items)
      const nextCursor = hasMore ? nextCursorForRow(items.at(-1)) : undefined
      return {
        items: summaries,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      }
    },

    async getAsset(input) {
      const [asset] = await db
        .select({ id: creativeAssets.id })
        .from(creativeAssets)
        .where(and(
          eq(creativeAssets.id, input.assetId),
          eq(creativeAssets.userId, input.userId),
          isNull(creativeAssets.deletedAt),
        ))
        .limit(1)
      return asset === undefined ? undefined : assetDetail(db, input.userId, input.assetId)
    },

    async resolveGenerationBindings(input) {
      return resolveGenerationBindings(db, input)
    },

    async archiveAsset(input) {
      const now = nowDate(input.now)
      await ownedAsset(db, input.userId, input.assetId)
      const [updated] = await db
        .update(creativeAssets)
        .set({ status: 'archived', updatedBy: input.userId, updatedAt: now })
        .where(and(eq(creativeAssets.id, input.assetId), eq(creativeAssets.userId, input.userId), isNull(creativeAssets.deletedAt)))
        .returning()
      if (updated === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Creative asset could not be archived')
      return assetDetail(db, input.userId, updated.id)
    },

    async attachAsset(input) {
      const now = nowDate(input.now)
      await db.transaction(async tx => {
        await attachAssetInTransaction(tx, {
          userId: input.userId,
          projectId: input.projectId,
          assetId: input.assetId,
          sortOrder: input.sortOrder ?? 0,
          now,
        })
      })
      return assetDetail(db, input.userId, input.assetId)
    },

    async detachAsset(input) {
      const now = nowDate(input.now)
      const project = await ownedProject(db, input.userId, input.projectId, { includeArchived: true })
      const [membership] = await db
        .select()
        .from(creativeProjectAssets)
        .innerJoin(creativeAssets, eq(creativeProjectAssets.assetId, creativeAssets.id))
        .where(and(
          eq(creativeProjectAssets.projectId, project.id),
          eq(creativeProjectAssets.assetId, input.assetId),
          eq(creativeAssets.userId, input.userId),
          isNull(creativeProjectAssets.deletedAt),
          isNull(creativeAssets.deletedAt),
        ))
        .limit(1)
      if (membership === undefined) {
        throw new CreativeAssetRepositoryError('CREATIVE_PROJECT_ASSET_NOT_FOUND', `Asset is not in project: ${input.assetId}`)
      }
      await db
        .update(creativeProjectAssets)
        .set({ deletedAt: now, deletedBy: input.userId, updatedBy: input.userId, updatedAt: now })
        .where(eq(creativeProjectAssets.id, membership.creative_project_assets.id))
      const refreshed = await db.select().from(creativeProjects).where(eq(creativeProjects.id, project.id)).limit(1)
      const currentProject = refreshed[0]
      if (currentProject === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Creative project could not be reloaded')
      return projectDetail(db, currentProject)
    },

    async createVersion(input) {
      const now = nowDate(input.now)
      await db.transaction(async tx => {
        const [asset] = await tx
          .select()
          .from(creativeAssets)
          .where(and(
            eq(creativeAssets.id, input.assetId),
            eq(creativeAssets.userId, input.userId),
            isNull(creativeAssets.deletedAt),
          ))
          .limit(1)
          .for('update')
        if (asset === undefined) {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_NOT_FOUND', `Creative asset not found: ${input.assetId}`)
        }
        if (asset.status === 'archived') {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_STATUS_INVALID', `Creative asset is archived: ${input.assetId}`)
        }
        const [latest] = await tx
          .select({ version: creativeAssetVersions.version })
          .from(creativeAssetVersions)
          .where(and(eq(creativeAssetVersions.assetId, asset.id), isNull(creativeAssetVersions.deletedAt)))
          .orderBy(desc(creativeAssetVersions.version))
          .limit(1)
          .for('update')
        await tx.insert(creativeAssetVersions).values({
          id: nextCreativeAssetVersionId(),
          assetId: asset.id,
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
          semanticSpecJson: input.semanticSpec,
          generationRecipeJson: input.generationRecipe,
          notes: input.notes ?? null,
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        })
      })
      return assetDetail(db, input.userId, input.assetId)
    },

    async createVersionFromGeneration(input) {
      return createVersionFromGeneration(db, input)
    },

    async addReference(input) {
      const now = nowDate(input.now)
      await db.transaction(async tx => {
        const [version] = await tx
          .select({ version: creativeAssetVersions, assetType: creativeAssets.type, assetStatus: creativeAssets.status })
          .from(creativeAssetVersions)
          .innerJoin(creativeAssets, eq(creativeAssetVersions.assetId, creativeAssets.id))
          .where(and(
            eq(creativeAssetVersions.id, input.assetVersionId),
            eq(creativeAssets.userId, input.userId),
            isNull(creativeAssetVersions.deletedAt),
            isNull(creativeAssets.deletedAt),
          ))
          .limit(1)
          .for('update')
        if (version === undefined) throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_NOT_FOUND', `Creative asset version not found: ${input.assetVersionId}`)
        if (version.assetStatus === 'archived') {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_STATUS_INVALID', 'References cannot be added to an archived asset')
        }
        if (version.version.status !== 'draft') {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_STATE_INVALID', 'References can only be changed on a draft asset version')
        }
        if (!isCreativeAssetReferenceRoleCompatible(version.assetType as Parameters<typeof isCreativeAssetReferenceRoleCompatible>[0], input.role)) {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_REFERENCE_INVALID', `Reference role '${input.role}' is incompatible with asset type '${version.assetType}'`)
        }
        const [source] = await tx
          .select({ id: userAssets.id })
          .from(userAssets)
          .where(and(
            eq(userAssets.id, input.userAssetId),
            eq(userAssets.userId, input.userId),
            eq(userAssets.kind, 'image'),
            eq(userAssets.status, 'ready'),
            isNull(userAssets.deletedAt),
          ))
          .limit(1)
        if (source === undefined) {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_REFERENCE_INVALID', 'Reference source must be an owned ready image asset')
        }
        const [existing] = await tx
          .select({ id: creativeAssetReferences.id })
          .from(creativeAssetReferences)
          .where(and(
            eq(creativeAssetReferences.assetVersionId, input.assetVersionId),
            eq(creativeAssetReferences.role, input.role),
            eq(creativeAssetReferences.position, input.position),
            isNull(creativeAssetReferences.deletedAt),
          ))
          .limit(1)
        if (existing !== undefined) {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_REFERENCE_INVALID', 'Reference role and position are already occupied')
        }
        await tx.insert(creativeAssetReferences).values({
          id: nextCreativeAssetReferenceId(),
          assetVersionId: input.assetVersionId,
          userAssetId: input.userAssetId,
          role: input.role,
          position: input.position,
          metadataJson: input.metadata,
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        })
      })
      const version = await db.select({ assetId: creativeAssetVersions.assetId }).from(creativeAssetVersions).where(eq(creativeAssetVersions.id, input.assetVersionId)).limit(1)
      const assetId = version[0]?.assetId
      if (assetId === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Reference asset could not be reloaded')
      return assetDetail(db, input.userId, assetId)
    },

    async removeReference(input: RemoveCreativeAssetReferenceRepositoryInput) {
      const now = nowDate(input.now)
      let assetId: string | undefined
      await db.transaction(async tx => {
        const [reference] = await tx
          .select({
            reference: creativeAssetReferences,
            version: creativeAssetVersions,
            assetStatus: creativeAssets.status,
          })
          .from(creativeAssetReferences)
          .innerJoin(creativeAssetVersions, eq(creativeAssetVersions.id, creativeAssetReferences.assetVersionId))
          .innerJoin(creativeAssets, eq(creativeAssets.id, creativeAssetVersions.assetId))
          .where(and(
            eq(creativeAssetReferences.id, input.referenceId),
            eq(creativeAssetReferences.assetVersionId, input.assetVersionId),
            eq(creativeAssets.userId, input.userId),
            isNull(creativeAssetReferences.deletedAt),
            isNull(creativeAssetVersions.deletedAt),
            isNull(creativeAssets.deletedAt),
          ))
          .limit(1)
          .for('update')
        if (reference === undefined) {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_REFERENCE_INVALID', `Creative asset reference not found: ${input.referenceId}`)
        }
        if (reference.assetStatus === 'archived') {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_STATUS_INVALID', 'References cannot be changed on an archived asset')
        }
        if (reference.version.status !== 'draft') {
          throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_STATE_INVALID', 'References can only be changed on a draft asset version')
        }
        assetId = reference.version.assetId
        await tx
          .update(creativeAssetReferences)
          .set({ deletedAt: now, deletedBy: input.userId, updatedBy: input.userId, updatedAt: now })
          .where(eq(creativeAssetReferences.id, input.referenceId))
      })
      if (assetId === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Reference asset could not be reloaded')
      return assetDetail(db, input.userId, assetId)
    },

    async transitionVersion(input) {
      const now = nowDate(input.now)
      let assetId: string | undefined
      await db.transaction(async tx => {
        const [current] = await tx
          .select({ version: creativeAssetVersions, assetUserId: creativeAssets.userId })
          .from(creativeAssetVersions)
          .innerJoin(creativeAssets, eq(creativeAssetVersions.assetId, creativeAssets.id))
          .where(and(
            eq(creativeAssetVersions.id, input.assetVersionId),
            eq(creativeAssets.userId, input.userId),
            isNull(creativeAssetVersions.deletedAt),
            isNull(creativeAssets.deletedAt),
          ))
          .limit(1)
          .for('update')
        if (current === undefined) throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_NOT_FOUND', `Creative asset version not found: ${input.assetVersionId}`)
        assetId = current.version.assetId
        assertVersionTransition(current.version.status as CreativeAssetVersionStatus, input.status)
        if (input.status === 'approved') {
          const [reference] = await tx
            .select({ id: creativeAssetReferences.id })
            .from(creativeAssetReferences)
            .where(and(eq(creativeAssetReferences.assetVersionId, input.assetVersionId), isNull(creativeAssetReferences.deletedAt)))
            .limit(1)
          if (reference === undefined) throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_STATE_INVALID', 'An asset version needs at least one reference before approval')
          const [approved] = await tx
            .select({ id: creativeAssetVersions.id })
            .from(creativeAssetVersions)
            .where(and(
              eq(creativeAssetVersions.assetId, current.version.assetId),
              eq(creativeAssetVersions.status, 'approved'),
              ne(creativeAssetVersions.id, input.assetVersionId),
              isNull(creativeAssetVersions.deletedAt),
            ))
            .limit(1)
          if (approved !== undefined) throw new CreativeAssetRepositoryError('CREATIVE_ASSET_VERSION_STATE_INVALID', 'The asset already has an approved version')
        }
        await tx
          .update(creativeAssetVersions)
          .set({ status: input.status, updatedBy: input.userId, updatedAt: now })
          .where(eq(creativeAssetVersions.id, input.assetVersionId))
        if (input.status === 'approved') {
          await tx
            .update(creativeAssets)
            .set({ status: 'active', updatedBy: input.userId, updatedAt: now })
            .where(eq(creativeAssets.id, current.version.assetId))
        }
      })
      if (assetId === undefined) throw new CreativeAssetRepositoryError('CREATIVE_DATABASE_ERROR', 'Asset version could not be reloaded')
      return assetDetail(db, input.userId, assetId)
    },
  }
}
