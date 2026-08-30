import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_NAVIGATION_CONFIG,
  discoverOfficialDocuments,
  fetchOfficialDocument,
  fetchOfficialNavigation,
  htmlToOfficialMarkdown,
  serializeOfficialRegistry,
  sha256,
  SUPPLEMENTAL_DOCUMENTS,
  type AliyunDocumentPage,
  type OfficialDocumentMapping,
  type OfficialDocumentRegistry,
} from './lib/official-bailian-documents'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const officialRoot = join(root, 'docs', 'bailian', 'official')
const rawRoot = join(officialRoot, 'raw')
const registryPath = join(officialRoot, 'registry.json')
const syncStatePath = join(officialRoot, 'sync-state.json')

export interface OfficialSnapshotPaths {
  root: string
  officialRoot: string
  rawRoot: string
  registryPath: string
  syncStatePath: string
}

export const DEFAULT_SNAPSHOT_PATHS: OfficialSnapshotPaths = {
  root,
  officialRoot,
  rawRoot,
  registryPath,
  syncStatePath,
}

export interface OfficialSourceDocument {
  path: string
  sourceUrl: string
  nodeId: number
  title: string
  officialPath: string
  officialVersion: number
  officialLastModifiedAt: string
  contentHash: `sha256:${string}`
  importedAt: string
  bytes: number
}

export interface OfficialSyncState {
  schemaVersion: 2
  source: 'https://help.aliyun.com/zh/model-studio'
  status: 'partial' | 'complete'
  expectedDocumentCount: number
  syncedAt: string
  documentCount: number
  sourceDocuments: OfficialSourceDocument[]
}

interface LegacyOfficialSyncState {
  schemaVersion: 1
  source: 'https://help.aliyun.com/zh/model-studio'
  syncedAt: string
  documentCount: number
  sourceDocuments: OfficialSourceDocument[]
}

type StoredOfficialSyncState = OfficialSyncState | LegacyOfficialSyncState

export interface SyncOfficialDocumentsOptions {
  checkOnly: boolean
  registry?: OfficialDocumentRegistry
  fetchNavigation?: () => Promise<OfficialDocumentRegistry>
  fetchDocument?: (mapping: OfficialDocumentMapping) => Promise<AliyunDocumentPage>
  minimumDocumentCount?: number
  paths?: OfficialSnapshotPaths
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const current = await readFile(path, 'utf8').catch(() => undefined)
  if (current === content) return
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, path)
}

async function readJson<T>(path: string): Promise<T | undefined> {
  const content = await readFile(path, 'utf8').catch(() => undefined)
  return content === undefined ? undefined : JSON.parse(content) as T
}

function latestOfficialUpdate(sourceDocuments: readonly OfficialSourceDocument[], fallback: string): string {
  return sourceDocuments
    .map(document => document.officialLastModifiedAt)
    .sort((left, right) => right.localeCompare(left, 'en'))[0] ?? fallback
}

function createSyncState(
  registry: OfficialDocumentRegistry,
  sourceDocuments: readonly OfficialSourceDocument[],
  status: OfficialSyncState['status'],
  fallbackSyncedAt: string,
): OfficialSyncState {
  const orderedDocuments = [...sourceDocuments].sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
  return {
    schemaVersion: 2,
    source: 'https://help.aliyun.com/zh/model-studio',
    status,
    expectedDocumentCount: registry.documents.length,
    syncedAt: latestOfficialUpdate(orderedDocuments, fallbackSyncedAt),
    documentCount: orderedDocuments.length,
    sourceDocuments: orderedDocuments,
  }
}

async function writeSyncCheckpoint(
  paths: OfficialSnapshotPaths,
  registry: OfficialDocumentRegistry,
  sourceDocuments: readonly OfficialSourceDocument[],
  status: OfficialSyncState['status'],
  fallbackSyncedAt: string,
): Promise<void> {
  await atomicWrite(paths.registryPath, serializeOfficialRegistry(registry))
  await atomicWrite(paths.syncStatePath, json(createSyncState(registry, sourceDocuments, status, fallbackSyncedAt)))
}

async function reusablePartialDocuments(
  state: StoredOfficialSyncState | undefined,
  previousRegistry: OfficialDocumentRegistry | undefined,
  registry: OfficialDocumentRegistry,
  paths: OfficialSnapshotPaths,
): Promise<OfficialSourceDocument[]> {
  if (
    state?.schemaVersion !== 2
    || state.status !== 'partial'
    || previousRegistry === undefined
    || serializeOfficialRegistry(previousRegistry) !== serializeOfficialRegistry(registry)
  ) return []

  const mappings = new Map(registry.documents.map(document => [document.path, document]))
  const reusable: OfficialSourceDocument[] = []
  for (const source of state.sourceDocuments) {
    const mapping = mappings.get(source.path)
    if (mapping === undefined || mapping.nodeId !== source.nodeId || mapping.url !== source.sourceUrl) continue
    const contentPath = join(paths.rawRoot, ...source.path.split('/'))
    const bytes = await readFile(contentPath, 'utf8').catch(() => undefined)
    if (bytes === undefined || new TextEncoder().encode(bytes).byteLength !== source.bytes || sha256(bytes) !== source.contentHash) continue
    reusable.push(source)
  }
  return reusable.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
}

async function markdownFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const result: string[] = []
  for (const entry of entries) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) result.push(...await markdownFiles(join(directory, entry.name), relativePath))
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(relativePath)
  }
  return result
}

function officialLastModifiedAt(page: AliyunDocumentPage): string {
  return new Date(page.lastModifiedTime).toISOString()
}

export function sourceDocumentFrom(
  mapping: OfficialDocumentMapping,
  page: AliyunDocumentPage,
  markdown: string,
  importedAt: string,
): OfficialSourceDocument {
  const bytes = new TextEncoder().encode(markdown)
  return {
    path: mapping.path,
    sourceUrl: mapping.url,
    nodeId: page.nodeId,
    title: page.title,
    officialPath: page.path,
    officialVersion: page.version,
    officialLastModifiedAt: officialLastModifiedAt(page),
    contentHash: sha256(bytes),
    importedAt,
    bytes: bytes.byteLength,
  }
}

export async function syncOfficialDocuments(
  options: SyncOfficialDocumentsOptions,
): Promise<{ changedDocuments: string[], documentCount: number, sourceImportedAt: string }> {
  const paths = options.paths ?? DEFAULT_SNAPSHOT_PATHS
  const discoveredRegistry = options.registry
    ?? await (options.fetchNavigation ?? (async () => discoverOfficialDocuments(await fetchOfficialNavigation(DEFAULT_NAVIGATION_CONFIG))))()
  const registry = options.registry ?? {
    ...discoveredRegistry,
    documents: [...discoveredRegistry.documents, ...SUPPLEMENTAL_DOCUMENTS]
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN')),
  }
  const minimumDocumentCount = options.minimumDocumentCount ?? DEFAULT_NAVIGATION_CONFIG.minimumDocumentCount
  if (registry.documents.length < minimumDocumentCount) {
    throw new Error(`Official document registry contains too few documents: ${registry.documents.length}`)
  }

  const fetchDocument = options.fetchDocument ?? ((mapping: OfficialDocumentMapping) => fetchOfficialDocument(mapping))
  const expectedRegistry = serializeOfficialRegistry(registry)
  const changedDocuments: string[] = []

  const previousRegistryRaw = await readFile(paths.registryPath, 'utf8').catch(() => undefined)
  const previousStateRaw = await readFile(paths.syncStatePath, 'utf8').catch(() => undefined)
  const previousState = await readJson<StoredOfficialSyncState>(paths.syncStatePath)
  const fallbackSyncedAt = previousState?.syncedAt ?? new Date().toISOString()
  const previousRegistry = await readJson<OfficialDocumentRegistry>(paths.registryPath)
  const previousPaths = new Set(previousRegistry?.documents.map(document => document.path) ?? [])
  const currentPaths = new Set(registry.documents.map(document => document.path))
  for (const path of await markdownFiles(paths.rawRoot)) {
    if (!previousPaths.has(path) || currentPaths.has(path)) continue
    changedDocuments.push(path)
  }

  const sourceDocuments: OfficialSourceDocument[] = options.checkOnly
    ? []
    : await reusablePartialDocuments(previousState, previousRegistry, registry, paths)
  if (!options.checkOnly) {
    await writeSyncCheckpoint(paths, registry, sourceDocuments, 'partial', fallbackSyncedAt)
  }

  const completedPaths = new Set(sourceDocuments.map(document => document.path))
  try {
    for (const mapping of registry.documents) {
      if (completedPaths.has(mapping.path)) continue
      const page = await fetchDocument(mapping)
      if (page.nodeId !== mapping.nodeId) {
        throw new Error(`${mapping.path}: expected node ${mapping.nodeId}, received ${page.nodeId}`)
      }
      const content = htmlToOfficialMarkdown(page.content)
      const path = join(paths.rawRoot, ...mapping.path.split('/'))
      const current = await readFile(path, 'utf8').catch(() => undefined)
      if (current !== content) changedDocuments.push(relative(paths.root, path).replaceAll('\\', '/'))
      if (!options.checkOnly) await atomicWrite(path, content)
      sourceDocuments.push(sourceDocumentFrom(mapping, page, content, officialLastModifiedAt(page)))
      if (!options.checkOnly) {
        await writeSyncCheckpoint(paths, registry, sourceDocuments, 'partial', fallbackSyncedAt)
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  catch (error) {
    throw new Error(
      `Official Bailian document sync interrupted with ${sourceDocuments.length}/${registry.documents.length} documents saved: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }

  const orderedSourceDocuments = sourceDocuments.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
  const sourceImportedAt = orderedSourceDocuments
    .map(document => document.officialLastModifiedAt)
    .sort((left, right) => right.localeCompare(left, 'en'))[0]
  if (sourceImportedAt === undefined) throw new Error('Official document registry is empty')
  const expectedState = json(createSyncState(registry, orderedSourceDocuments, 'complete', fallbackSyncedAt))

  if (!options.checkOnly) {
    for (const path of await markdownFiles(paths.rawRoot)) {
      if (previousPaths.has(path) && !currentPaths.has(path)) await rm(join(paths.rawRoot, ...path.split('/')), { force: true })
    }
    await writeSyncCheckpoint(paths, registry, orderedSourceDocuments, 'complete', fallbackSyncedAt)
  }

  if (previousRegistryRaw !== expectedRegistry) changedDocuments.push(relative(paths.root, paths.registryPath).replaceAll('\\', '/'))
  if (previousStateRaw !== expectedState) changedDocuments.push(relative(paths.root, paths.syncStatePath).replaceAll('\\', '/'))

  const uniqueChangedDocuments = [...new Set(changedDocuments)].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  if (options.checkOnly) {
    if (uniqueChangedDocuments.length > 0) {
      throw new Error(`Official Bailian document snapshot is stale:\n${uniqueChangedDocuments.map(path => `- ${path}`).join('\n')}`)
    }
  }

  return {
    changedDocuments: uniqueChangedDocuments,
    documentCount: orderedSourceDocuments.length,
    sourceImportedAt,
  }
}

export async function verifyOfficialSnapshot(
  paths: OfficialSnapshotPaths = DEFAULT_SNAPSHOT_PATHS,
): Promise<{ documentCount: number, sourceImportedAt: string }> {
  const registry = await readJson<OfficialDocumentRegistry>(paths.registryPath)
  const state = await readJson<StoredOfficialSyncState>(paths.syncStatePath)
  if (registry === undefined || state === undefined) {
    throw new Error('Official Bailian snapshot is incomplete: registry.json and sync-state.json are both required')
  }
  if (state.schemaVersion === 2 && state.status === 'partial') {
    throw new Error(`Official Bailian snapshot is incomplete: ${state.documentCount}/${state.expectedDocumentCount} documents saved`)
  }
  const stateSchemaVersion: unknown = state.schemaVersion
  if (stateSchemaVersion !== 1 && stateSchemaVersion !== 2) {
    throw new Error(`Unsupported official Bailian snapshot schema version: ${String(stateSchemaVersion)}`)
  }
  if (state.schemaVersion === 2 && state.status !== 'complete') {
    throw new Error(`Invalid official Bailian snapshot status: ${String(state.status)}`)
  }
  if (registry.documents.length !== state.documentCount || state.sourceDocuments.length !== state.documentCount) {
    throw new Error(`Official Bailian snapshot count mismatch: registry=${registry.documents.length}, state=${state.documentCount}`)
  }
  if (state.schemaVersion === 2 && state.expectedDocumentCount !== registry.documents.length) {
    throw new Error(`Official Bailian snapshot expected count mismatch: registry=${registry.documents.length}, state=${state.expectedDocumentCount}`)
  }

  const mappings = new Map(registry.documents.map(document => [document.path, document]))
  const sources = new Map(state.sourceDocuments.map(document => [document.path, document]))
  for (const [path, mapping] of mappings) {
    if (path.startsWith('/') || path.split('/').includes('..') || !path.endsWith('.md')) {
      throw new Error(`Official Bailian snapshot contains an unsafe path: ${path}`)
    }
    const source = sources.get(path)
    if (source === undefined) throw new Error(`Official Bailian snapshot is missing source metadata: ${path}`)
    if (source.nodeId !== mapping.nodeId || source.sourceUrl !== mapping.url) {
      throw new Error(`Official Bailian snapshot provenance mismatch: ${path}`)
    }
    const bytes = await readFile(join(paths.rawRoot, ...path.split('/')))
    if (bytes.byteLength !== source.bytes || sha256(bytes) !== source.contentHash) {
      throw new Error(`Official Bailian snapshot hash mismatch: ${path}`)
    }
  }
  for (const path of sources.keys()) {
    if (!mappings.has(path)) throw new Error(`Official Bailian snapshot has unregistered source metadata: ${path}`)
  }

  const registeredPaths = [...mappings.keys()].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const actualPaths = (await markdownFiles(paths.rawRoot)).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  if (JSON.stringify(registeredPaths) !== JSON.stringify(actualPaths)) {
    throw new Error('Official Bailian raw document set does not match registry.json')
  }
  // reset 快照用 importedAt；本地同步产物用 officialLastModifiedAt——取可用字段
  const sourceImportedAt = state.sourceDocuments
    .map(document => document.officialLastModifiedAt ?? document.importedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort((left, right) => right.localeCompare(left, 'en'))[0]
  if (sourceImportedAt === undefined || sourceImportedAt !== state.syncedAt) {
    throw new Error('Official Bailian sync-state.json syncedAt is not the latest official update')
  }
  return { documentCount: state.documentCount, sourceImportedAt }
}

async function main(): Promise<number> {
  if (process.argv.includes('--snapshot')) {
    const result = await verifyOfficialSnapshot()
    console.log(`Checked ${result.documentCount} local official Bailian document snapshots (latest official update ${result.sourceImportedAt})`)
    return 0
  }
  const checkOnly = process.argv.includes('--check')
  const result = await syncOfficialDocuments({ checkOnly })
  console.log(`${checkOnly ? 'Checked' : 'Synced'} ${result.documentCount} official Bailian documents; changed ${result.changedDocuments.length} file(s)`)
  return 0
}

if (import.meta.main) {
  try {
    process.exitCode = await main()
  }
  catch (error) {
    console.error(`Official Bailian document sync failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
