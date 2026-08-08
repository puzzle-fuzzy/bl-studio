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
  schemaVersion: 1
  source: 'https://help.aliyun.com/zh/model-studio'
  syncedAt: string
  documentCount: number
  sourceDocuments: OfficialSourceDocument[]
}

export interface SyncOfficialDocumentsOptions {
  checkOnly: boolean
  registry?: OfficialDocumentRegistry
  fetchNavigation?: () => Promise<OfficialDocumentRegistry>
  fetchDocument?: (mapping: OfficialDocumentMapping) => Promise<AliyunDocumentPage>
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

async function fetchAllDocuments(
  registry: OfficialDocumentRegistry,
  fetchDocument: (mapping: OfficialDocumentMapping) => Promise<AliyunDocumentPage>,
): Promise<{ markdown: Map<string, string>, sourceDocuments: OfficialSourceDocument[] }> {
  const markdown = new Map<string, string>()
  const sourceDocuments: OfficialSourceDocument[] = []
  for (const mapping of registry.documents) {
    const page = await fetchDocument(mapping)
    if (page.nodeId !== mapping.nodeId) {
      throw new Error(`${mapping.path}: expected node ${mapping.nodeId}, received ${page.nodeId}`)
    }
    const content = htmlToOfficialMarkdown(page.content)
    markdown.set(mapping.path, content)
    sourceDocuments.push(sourceDocumentFrom(mapping, page, content, officialLastModifiedAt(page)))
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return { markdown, sourceDocuments }
}

export async function syncOfficialDocuments(
  options: SyncOfficialDocumentsOptions,
): Promise<{ changedDocuments: string[], documentCount: number, sourceImportedAt: string }> {
  const discoveredRegistry = options.registry
    ?? await (options.fetchNavigation ?? (async () => discoverOfficialDocuments(await fetchOfficialNavigation(DEFAULT_NAVIGATION_CONFIG))))()
  const registry = options.registry ?? {
    ...discoveredRegistry,
    documents: [...discoveredRegistry.documents, ...SUPPLEMENTAL_DOCUMENTS]
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN')),
  }
  if (registry.documents.length < DEFAULT_NAVIGATION_CONFIG.minimumDocumentCount) {
    throw new Error(`Official document registry contains too few documents: ${registry.documents.length}`)
  }

  const fetchDocument = options.fetchDocument ?? ((mapping: OfficialDocumentMapping) => fetchOfficialDocument(mapping))
  const snapshot = await fetchAllDocuments(registry, fetchDocument)
  const sourceDocuments = snapshot.sourceDocuments.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
  const sourceImportedAt = sourceDocuments
    .map(document => document.officialLastModifiedAt)
    .sort((left, right) => right.localeCompare(left, 'en'))[0]
  if (sourceImportedAt === undefined) throw new Error('Official document registry is empty')
  const state: OfficialSyncState = {
    schemaVersion: 1,
    source: 'https://help.aliyun.com/zh/model-studio',
    syncedAt: sourceImportedAt,
    documentCount: sourceDocuments.length,
    sourceDocuments,
  }
  const expectedRegistry = serializeOfficialRegistry(registry)
  const expectedState = json(state)
  const changedDocuments: string[] = []

  const previousRegistry = await readJson<OfficialDocumentRegistry>(registryPath)
  const previousPaths = new Set(previousRegistry?.documents.map(document => document.path) ?? [])
  const currentPaths = new Set(registry.documents.map(document => document.path))
  for (const path of await markdownFiles(rawRoot)) {
    if (!previousPaths.has(path) || currentPaths.has(path)) continue
    changedDocuments.push(path)
  }

  for (const mapping of registry.documents) {
    const path = join(rawRoot, ...mapping.path.split('/'))
    const content = snapshot.markdown.get(mapping.path)
    if (content === undefined) throw new Error(`Missing fetched content for ${mapping.path}`)
    const current = await readFile(path, 'utf8').catch(() => undefined)
    if (current !== content) changedDocuments.push(relative(root, path).replaceAll('\\', '/'))
  }
  const currentRegistry = await readFile(registryPath, 'utf8').catch(() => undefined)
  if (currentRegistry !== expectedRegistry) changedDocuments.push(relative(root, registryPath).replaceAll('\\', '/'))
  const currentState = await readFile(syncStatePath, 'utf8').catch(() => undefined)
  if (currentState !== expectedState) changedDocuments.push(relative(root, syncStatePath).replaceAll('\\', '/'))

  const uniqueChangedDocuments = [...new Set(changedDocuments)].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  if (options.checkOnly) {
    if (uniqueChangedDocuments.length > 0) {
      throw new Error(`Official Bailian document snapshot is stale:\n${uniqueChangedDocuments.map(path => `- ${path}`).join('\n')}`)
    }
  }
  else {
    for (const mapping of registry.documents) {
      const path = join(rawRoot, ...mapping.path.split('/'))
      const content = snapshot.markdown.get(mapping.path)
      if (content !== undefined) await atomicWrite(path, content)
    }
    for (const path of await markdownFiles(rawRoot)) {
      if (previousPaths.has(path) && !currentPaths.has(path)) await rm(join(rawRoot, ...path.split('/')), { force: true })
    }
    await atomicWrite(registryPath, expectedRegistry)
    await atomicWrite(syncStatePath, expectedState)
  }

  return {
    changedDocuments: uniqueChangedDocuments,
    documentCount: sourceDocuments.length,
    sourceImportedAt,
  }
}

export async function verifyOfficialSnapshot(): Promise<{ documentCount: number, sourceImportedAt: string }> {
  const registry = await readJson<OfficialDocumentRegistry>(registryPath)
  const state = await readJson<OfficialSyncState>(syncStatePath)
  if (registry === undefined || state === undefined) {
    throw new Error('Official Bailian snapshot is incomplete: registry.json and sync-state.json are both required')
  }
  if (registry.documents.length !== state.documentCount || state.sourceDocuments.length !== state.documentCount) {
    throw new Error(`Official Bailian snapshot count mismatch: registry=${registry.documents.length}, state=${state.documentCount}`)
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
    const bytes = await readFile(join(rawRoot, ...path.split('/')))
    if (bytes.byteLength !== source.bytes || sha256(bytes) !== source.contentHash) {
      throw new Error(`Official Bailian snapshot hash mismatch: ${path}`)
    }
  }
  for (const path of sources.keys()) {
    if (!mappings.has(path)) throw new Error(`Official Bailian snapshot has unregistered source metadata: ${path}`)
  }

  const registeredPaths = [...mappings.keys()].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const actualPaths = (await markdownFiles(rawRoot)).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  if (JSON.stringify(registeredPaths) !== JSON.stringify(actualPaths)) {
    throw new Error('Official Bailian raw document set does not match registry.json')
  }
  const sourceImportedAt = state.sourceDocuments
    .map(document => document.officialLastModifiedAt)
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
