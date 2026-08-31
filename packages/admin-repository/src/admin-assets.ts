import {
  assetDerivatives,
  generationArtifacts,
  generationRecords,
  type BailianStudioDb,
  userAssets,
} from '@bailian-studio/db'
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { AdminRepositoryError } from './errors'
import type {
  AdminAssetItem,
  AdminAssetListOptions,
  ArtifactKind,
  ListAdminAssetsResult,
} from './types'

export interface AdminAssetRepository {
  listUserAssets(userId: string, options?: AdminAssetListOptions): Promise<ListAdminAssetsResult>
  getUserAsset(input: {
    userId: string
    assetId: string
    includeDeleted?: boolean
  }): Promise<AdminAssetItem | undefined>
}

interface AssetCursorFilters {
  kind: string | null
  source: string | null
  q: string | null
  modelIds: string[]
}

interface AssetCursorPayload {
  v: 1
  resource: 'admin-assets'
  sort: NonNullable<AdminAssetListOptions['sort']>
  value: string | number | null
  id: string
  filters: AssetCursorFilters
}

function normalizeSearch(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized === undefined || normalized.length === 0 ? null : normalized
}

function cursorFilters(options: AdminAssetListOptions): AssetCursorFilters {
  const q = normalizeSearch(options.q)
  return {
    kind: options.kind ?? null,
    source: options.source ?? null,
    q,
    modelIds: q === null
      ? []
      : [...new Set(options.modelIds?.filter(id => id.length > 0) ?? [])].sort(),
  }
}

function encodeAssetCursor(
  payload: Omit<AssetCursorPayload, 'v' | 'resource'>,
): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    resource: 'admin-assets',
    ...payload,
  } satisfies AssetCursorPayload), 'utf8').toString('base64url')
}

function decodeAssetCursor(
  token: string,
  expected: { sort: NonNullable<AdminAssetListOptions['sort']>; filters: AssetCursorFilters },
): AssetCursorPayload {
  if (token.length === 0 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw invalidCursor('cursor is not valid base64url')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursor('cursor is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalidCursor('cursor payload must be an object')
  }

  const payload = parsed as Record<string, unknown>
  if (payload['v'] !== 1 || payload['resource'] !== 'admin-assets') {
    throw invalidCursor('cursor version or resource is unsupported')
  }
  if (!isAssetSort(payload['sort'])) throw invalidCursor('cursor sort is invalid')
  if (typeof payload['id'] !== 'string' || payload['id'].length === 0) {
    throw invalidCursor('cursor id is invalid')
  }
  if (payload['sort'] !== expected.sort) throw invalidCursor('cursor sort does not match the query')

  const filters = readCursorFilters(payload['filters'])
  if (!sameFilters(filters, expected.filters)) {
    throw invalidCursor('cursor filters do not match the query')
  }

  const value = payload['value']
  if (payload['sort'] === 'time') {
    if (typeof value !== 'string' || !isCanonicalIsoDate(value)) {
      throw invalidCursor('time cursor value must be an ISO date')
    }
  } else if (payload['sort'] === 'title') {
    if (typeof value !== 'string') throw invalidCursor('title cursor value must be a string')
  } else if (
    value !== null
    && (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw invalidCursor('size cursor value must be a finite number or null')
  }

  return {
    v: 1,
    resource: 'admin-assets',
    sort: payload['sort'],
    value: value as string | number | null,
    id: payload['id'],
    filters,
  }
}

function readCursorFilters(value: unknown): AssetCursorFilters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidCursor('cursor filters must be an object')
  }
  const filters = value as Record<string, unknown>
  const kind = nullableString(filters['kind'], 'kind')
  const source = nullableString(filters['source'], 'source')
  const q = nullableString(filters['q'], 'q')
  const modelIds = stringArray(filters['modelIds'], 'modelIds')
  if (q !== null && normalizeSearch(q) !== q) {
    throw invalidCursor('cursor search filter is not normalized')
  }
  return { kind, source, q, modelIds }
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null || typeof value === 'string') return value
  throw invalidCursor(`cursor ${name} filter must be a string or null`)
}

function stringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value)
    || value.some(item => typeof item !== 'string' || item.length === 0)
  ) throw invalidCursor(`cursor ${name} filter must be an array of strings`)
  const normalized = [...new Set(value)].sort()
  if (normalized.length !== value.length || normalized.some((item, index) => item !== value[index])) {
    throw invalidCursor(`cursor ${name} filter is not normalized`)
  }
  return normalized
}

function sameFilters(left: AssetCursorFilters, right: AssetCursorFilters): boolean {
  return left.kind === right.kind
    && left.source === right.source
    && left.q === right.q
    && left.modelIds.length === right.modelIds.length
    && left.modelIds.every((id, index) => id === right.modelIds[index])
}

function isAssetSort(value: unknown): value is NonNullable<AdminAssetListOptions['sort']> {
  return value === 'time' || value === 'title' || value === 'size'
}

function isCanonicalIsoDate(value: string): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function invalidCursor(reason: string): AdminRepositoryError {
  return new AdminRepositoryError('ADMIN_INVALID_CURSOR', `Invalid admin asset cursor: ${reason}`)
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function durationSeconds(
  metadataValue: unknown,
  requestValue: unknown,
): number | undefined {
  const metadata = recordValue(metadataValue)
  const stored = metadata?.['durationSeconds']
  if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) return stored
  const request = recordValue(requestValue)
  const requested = request?.['duration']
  return typeof requested === 'number' && Number.isFinite(requested) && requested >= 0
    ? requested
    : undefined
}

function normalizeResolution(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (normalized.length === 0) return undefined
  const dimensions = /^(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)$/i.exec(normalized)
  return dimensions === null ? normalized : `${dimensions[1]}×${dimensions[2]}`
}

function declaredResolution(
  metadataValue: unknown,
  requestValue: unknown,
): string | undefined {
  const metadata = recordValue(metadataValue)
  const width = metadata?.['width']
  const height = metadata?.['height']
  if (
    typeof width === 'number' && Number.isFinite(width) && width > 0
    && typeof height === 'number' && Number.isFinite(height) && height > 0
  ) return `${width}×${height}`

  const stored = normalizeResolution(metadata?.['resolution']) ?? normalizeResolution(metadata?.['size'])
  if (stored !== undefined) return stored
  const request = recordValue(requestValue)
  return normalizeResolution(request?.['size']) ?? normalizeResolution(request?.['resolution'])
}

function escapedLikePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 20
  return Math.max(1, Math.min(100, Math.floor(value)))
}

function toAdminAssetItem(
  row: typeof userAssets.$inferSelect,
  artifactText?: string | null,
  thumbnail?: typeof assetDerivatives.$inferSelect | null,
  generationInputParams?: Record<string, unknown> | null,
): AdminAssetItem {
  const url = row.storageUrl ?? (row.storageKey === null ? row.originalUrl ?? undefined : undefined)
  const storedDuration = durationSeconds(row.metadataJson, generationInputParams)
  const storedResolution = declaredResolution(row.metadataJson, generationInputParams)
  return {
    id: row.id,
    kind: row.kind as ArtifactKind,
    source: row.source as AdminAssetItem['source'],
    ...(row.generationArtifactId !== null ? { generationArtifactId: row.generationArtifactId } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(artifactText !== undefined && artifactText !== null ? { text: artifactText } : {}),
    ...(row.mimeType !== null ? { mimeType: row.mimeType } : {}),
    ...(row.byteSize !== null ? { byteSize: row.byteSize } : {}),
    ...(storedDuration !== undefined ? { durationSeconds: storedDuration } : {}),
    ...(storedResolution !== undefined ? { declaredResolution: storedResolution } : {}),
    ...(row.fileName !== null ? { fileName: row.fileName } : {}),
    ...(row.recordId !== null ? { recordId: row.recordId } : {}),
    ...(row.modelId !== null ? { modelId: row.modelId } : {}),
    ...(row.storageProvider !== null ? { storageProvider: row.storageProvider } : {}),
    ...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
    ...(thumbnail !== undefined && thumbnail !== null
      ? {
          thumbnailStatus: thumbnail.status as AdminAssetItem['thumbnailStatus'],
          ...(thumbnail.storageProvider !== null ? { thumbnailStorageProvider: thumbnail.storageProvider } : {}),
          ...(thumbnail.storageKey !== null ? { thumbnailStorageKey: thumbnail.storageKey } : {}),
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

export function createAdminAssetRepository(db: BailianStudioDb): AdminAssetRepository {
  async function listUserAssets(
    userId: string,
    input: AdminAssetListOptions = {},
  ): Promise<ListAdminAssetsResult> {
    const limit = clampLimit(input.limit)
    const sort = input.sort ?? 'time'
    const filters = cursorFilters(input)
    const cursor = input.cursor === undefined
      ? undefined
      : decodeAssetCursor(input.cursor, { sort, filters })
    const query = input.q?.trim()
    const modelIds = input.modelIds?.filter(id => id.length > 0) ?? []
    const titleSortValue = sql<string>`lower(coalesce(${userAssets.fileName}, ${userAssets.modelId}, ${userAssets.id}))`
    const searchCondition = query
      ? or(
          ilike(userAssets.id, escapedLikePattern(query)),
          ilike(userAssets.fileName, escapedLikePattern(query)),
          ilike(userAssets.modelId, escapedLikePattern(query)),
          modelIds.length > 0 ? inArray(userAssets.modelId, modelIds) : undefined,
        )
      : undefined
    const cursorCondition = cursor === undefined
      ? undefined
      : sort === 'time' && typeof cursor.value === 'string'
        ? or(
            lt(userAssets.createdAt, new Date(cursor.value)),
            and(eq(userAssets.createdAt, new Date(cursor.value)), lt(userAssets.id, cursor.id)),
          )
        : sort === 'title' && typeof cursor.value === 'string'
          ? or(
              gt(titleSortValue, cursor.value),
              and(eq(titleSortValue, cursor.value), gt(userAssets.id, cursor.id)),
            )
          : sort === 'size' && cursor.value === null
            ? and(isNull(userAssets.byteSize), lt(userAssets.id, cursor.id))
            : sort === 'size' && typeof cursor.value === 'number'
              ? or(
                  lt(userAssets.byteSize, cursor.value),
                  isNull(userAssets.byteSize),
                  and(eq(userAssets.byteSize, cursor.value), lt(userAssets.id, cursor.id)),
                )
              : undefined
    const orderBy = sort === 'time'
      ? [desc(userAssets.createdAt), desc(userAssets.id)]
      : sort === 'title'
        ? [asc(titleSortValue), asc(userAssets.id)]
        : [sql`${userAssets.byteSize} desc nulls last`, desc(userAssets.id)]

    const rows = await db
      .select({
        asset: userAssets,
        artifactText: generationArtifacts.text,
        thumbnail: assetDerivatives,
        generationInputParams: generationRecords.inputParamsJson,
        titleSortValue,
      })
      .from(userAssets)
      .leftJoin(generationArtifacts, eq(userAssets.generationArtifactId, generationArtifacts.id))
      .leftJoin(
        assetDerivatives,
        and(
          eq(assetDerivatives.assetId, userAssets.id),
          eq(assetDerivatives.kind, 'thumbnail'),
          isNull(assetDerivatives.deletedAt),
        ),
      )
      .leftJoin(
        generationRecords,
        and(
          eq(userAssets.recordId, generationRecords.id),
          eq(userAssets.userId, generationRecords.userId),
        ),
      )
      .where(and(
        eq(userAssets.userId, userId),
        eq(userAssets.status, 'ready'),
        isNull(userAssets.deletedAt),
        input.kind !== undefined ? eq(userAssets.kind, input.kind) : undefined,
        input.source !== undefined ? eq(userAssets.source, input.source) : undefined,
        searchCondition,
        cursorCondition,
      ))
      .orderBy(...orderBy)
      .limit(limit + 1)

    const page = rows.slice(0, limit)
    const items = page.map(row => toAdminAssetItem(
      row.asset,
      row.artifactText,
      row.thumbnail,
      row.generationInputParams,
    ))
    const last = page.at(-1)
    const nextCursor = last !== undefined && rows.length > limit
      ? encodeAssetCursor({
          sort,
          value: sort === 'time'
            ? last.asset.createdAt.toISOString()
            : sort === 'title'
              ? rows[page.length - 1]?.titleSortValue ?? ''
              : last.asset.byteSize ?? null,
          id: last.asset.id,
          filters,
        })
      : undefined
    return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) }
  }

  async function getUserAsset(input: {
    userId: string
    assetId: string
    includeDeleted?: boolean
  }): Promise<AdminAssetItem | undefined> {
    const [row] = await db
      .select({
        asset: userAssets,
        artifactText: generationArtifacts.text,
        thumbnail: assetDerivatives,
        generationInputParams: generationRecords.inputParamsJson,
      })
      .from(userAssets)
      .leftJoin(generationArtifacts, eq(userAssets.generationArtifactId, generationArtifacts.id))
      .leftJoin(
        assetDerivatives,
        and(
          eq(assetDerivatives.assetId, userAssets.id),
          eq(assetDerivatives.kind, 'thumbnail'),
          isNull(assetDerivatives.deletedAt),
        ),
      )
      .leftJoin(
        generationRecords,
        and(
          eq(userAssets.recordId, generationRecords.id),
          eq(userAssets.userId, generationRecords.userId),
        ),
      )
      .where(and(
        eq(userAssets.id, input.assetId),
        eq(userAssets.userId, input.userId),
        eq(userAssets.status, 'ready'),
        input.includeDeleted === true ? undefined : isNull(userAssets.deletedAt),
      ))
      .limit(1)
    return row === undefined
      ? undefined
      : toAdminAssetItem(row.asset, row.artifactText, row.thumbnail, row.generationInputParams)
  }

  return { listUserAssets, getUserAsset }
}
