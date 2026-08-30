import type { Edge, Node } from '@xyflow/react'
import { normalizeStoredCanvasEdge, normalizeStoredCanvasNode } from './media-node-data'

const BOOTSTRAP_STORAGE_KEY = 'bailian-studio:canvas:bootstrap:v2'
const LEGACY_STORAGE_KEY = 'bailian-studio:canvas:v1'
const DOCUMENT_STORAGE_PREFIX = 'bailian-studio:canvas:document:v2:'

export interface CanvasDraft {
  documentId?: string
  revision?: number
  title?: string
  nodes: Node[]
  edges: Edge[]
}

interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value))
}

function documentStorageKey(documentId: string): string {
  return `${DOCUMENT_STORAGE_PREFIX}${encodeURIComponent(documentId)}`
}

function parseDraft(value: unknown, expectedDocumentId?: string): CanvasDraft | null {
  const record = objectRecord(value)
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) return null
  const documentId = typeof record.documentId === 'string' && record.documentId.length > 0
    ? record.documentId
    : undefined
  if (expectedDocumentId !== undefined && documentId !== expectedDocumentId) return null

  const nodes = record.nodes.flatMap(node => {
    const normalized = normalizeStoredCanvasNode(node)
    return normalized === undefined ? [] : [normalized]
  })
  const edges = record.edges.flatMap(edge => {
    const normalized = normalizeStoredCanvasEdge(edge)
    return normalized === undefined ? [] : [normalized]
  })
  return {
    ...(documentId === undefined ? {} : { documentId }),
    ...(typeof record.revision === 'number' && Number.isInteger(record.revision) && record.revision > 0
      ? { revision: record.revision }
      : {}),
    ...(typeof record.title === 'string' && record.title.length > 0 ? { title: record.title } : {}),
    nodes,
    edges,
  }
}

function readDraft(storage: DraftStorage, key: string, expectedDocumentId?: string): CanvasDraft | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  try {
    return parseDraft(JSON.parse(raw), expectedDocumentId)
  }
  catch {
    return null
  }
}

/** 读取未绑定服务端文档的离线草稿；旧 v1 key 只作为一次性兼容输入。 */
export function loadCanvasBootstrapDraft(storage: DraftStorage): CanvasDraft | null {
  const current = readDraft(storage, BOOTSTRAP_STORAGE_KEY)
  if (current !== null) return current
  const legacy = readDraft(storage, LEGACY_STORAGE_KEY)
  if (legacy === null) return null
  writeCanvasDraft(storage, legacy)
  storage.removeItem(LEGACY_STORAGE_KEY)
  return legacy
}

export function loadCanvasDocumentDraft(storage: DraftStorage, documentId: string): CanvasDraft | null {
  return readDraft(storage, documentStorageKey(documentId), documentId)
}

export function writeCanvasDraft(storage: DraftStorage, draft: CanvasDraft): void {
  const { documentId, ...payload } = draft
  const key = documentId === undefined ? BOOTSTRAP_STORAGE_KEY : documentStorageKey(documentId)
  storage.setItem(key, JSON.stringify({
    ...(documentId === undefined ? {} : { documentId }),
    ...payload,
  }))
  if (documentId !== undefined) storage.removeItem(BOOTSTRAP_STORAGE_KEY)
}

export function clearCanvasDraft(storage: DraftStorage, documentId?: string): void {
  storage.removeItem(BOOTSTRAP_STORAGE_KEY)
  storage.removeItem(LEGACY_STORAGE_KEY)
  if (documentId !== undefined) storage.removeItem(documentStorageKey(documentId))
}

export function clearAllCanvasDrafts(storage: DraftStorage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
  for (const key of keys) {
    if (key === BOOTSTRAP_STORAGE_KEY || key === LEGACY_STORAGE_KEY || key?.startsWith(DOCUMENT_STORAGE_PREFIX)) {
      storage.removeItem(key ?? '')
    }
  }
}

export function browserDraftStorage(): DraftStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}
