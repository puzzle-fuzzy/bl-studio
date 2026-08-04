/** 规范资产列表的 keyset 游标：带版本号，并与资源类型及过滤条件绑定。 */
import { GenerationRepositoryError } from './errors'
import type { AssetSort, ListUnifiedAssetsOptions } from './asset-types'

export interface AssetCursorFilters {
  kind: string | null
  source: string | null
  q: string | null
  modelIds: string[]
}

export interface AssetCursorPayload {
  v: 1
  resource: 'assets'
  sort: AssetSort
  value: string | number | null
  id: string
  filters: AssetCursorFilters
}

export function assetCursorFilters(options: ListUnifiedAssetsOptions): AssetCursorFilters {
  const q = normalizeAssetSearch(options.q)
  return {
    kind: options.kind ?? null,
    source: options.source ?? null,
    q,
    modelIds: q === null
      ? []
      : [...new Set(options.modelIds?.filter(id => id.length > 0) ?? [])].sort(),
  }
}

export function normalizeAssetSearch(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized === undefined || normalized.length === 0 ? null : normalized
}

export function encodeAssetCursor(
  payload: Omit<AssetCursorPayload, 'v' | 'resource'>,
): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    resource: 'assets',
    ...payload,
  } satisfies AssetCursorPayload), 'utf8').toString('base64url')
}

export function decodeAssetCursor(
  token: string,
  expected: { sort: AssetSort; filters: AssetCursorFilters },
): AssetCursorPayload {
  if (token.length === 0 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw invalidAssetCursor('cursor is not valid base64url')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    throw invalidAssetCursor('cursor is not valid JSON')
  }

  const cursor = readAssetCursorPayload(parsed)
  if (cursor.sort !== expected.sort) {
    throw invalidAssetCursor('cursor sort does not match the query')
  }
  if (!sameFilters(cursor.filters, expected.filters)) {
    throw invalidAssetCursor('cursor filters do not match the query')
  }
  return cursor
}

function readAssetCursorPayload(value: unknown): AssetCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidAssetCursor('cursor payload must be an object')
  }

  const payload = value as Record<string, unknown>
  if (payload['v'] !== 1 || payload['resource'] !== 'assets') {
    throw invalidAssetCursor('cursor version or resource is unsupported')
  }
  if (!isAssetSort(payload['sort'])) {
    throw invalidAssetCursor('cursor sort is invalid')
  }
  if (typeof payload['id'] !== 'string' || payload['id'].length === 0) {
    throw invalidAssetCursor('cursor id is invalid')
  }

  const filters = readAssetCursorFilters(payload['filters'])
  const sort = payload['sort']
  const cursorValue = payload['value']
  if (sort === 'time') {
    if (typeof cursorValue !== 'string' || !isCanonicalIsoDate(cursorValue)) {
      throw invalidAssetCursor('time cursor value must be an ISO date')
    }
  } else if (sort === 'title') {
    if (typeof cursorValue !== 'string') {
      throw invalidAssetCursor('title cursor value must be a string')
    }
  } else if (
    cursorValue !== null
    && (typeof cursorValue !== 'number' || !Number.isFinite(cursorValue))
  ) {
    throw invalidAssetCursor('size cursor value must be a finite number or null')
  }

  return {
    v: 1,
    resource: 'assets',
    sort,
    value: cursorValue as string | number | null,
    id: payload['id'],
    filters,
  }
}

function readAssetCursorFilters(value: unknown): AssetCursorFilters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidAssetCursor('cursor filters must be an object')
  }
  const filters = value as Record<string, unknown>
  const kind = readNullableString(filters['kind'], 'kind')
  const source = readNullableString(filters['source'], 'source')
  const q = readNullableString(filters['q'], 'q')
  const modelIds = readCanonicalStringArray(filters['modelIds'], 'modelIds')
  if (q !== null && normalizeAssetSearch(q) !== q) {
    throw invalidAssetCursor('cursor search filter is not normalized')
  }
  return { kind, source, q, modelIds }
}

function readNullableString(value: unknown, name: string): string | null {
  if (value === null || typeof value === 'string') return value
  throw invalidAssetCursor(`cursor ${name} filter must be a string or null`)
}

function readCanonicalStringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value)
    || value.some(item => typeof item !== 'string' || item.length === 0)
  ) {
    throw invalidAssetCursor(`cursor ${name} filter must be an array of strings`)
  }
  const normalized = [...new Set(value)].sort()
  if (normalized.length !== value.length || normalized.some((item, index) => item !== value[index])) {
    throw invalidAssetCursor(`cursor ${name} filter is not normalized`)
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

function isAssetSort(value: unknown): value is AssetSort {
  return value === 'time' || value === 'title' || value === 'size'
}

function isCanonicalIsoDate(value: string): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function invalidAssetCursor(reason: string): GenerationRepositoryError {
  return new GenerationRepositoryError('INVALID_CURSOR', `Invalid asset cursor: ${reason}`)
}
