import {
  ApiClientError,
  type AssetItem,
  type CanvasDocument,
  type CanvasDocumentSummary,
  type CanvasVersion,
} from '@bailian-studio/api-client'
import { apiClient } from '@bailian-studio/lib-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { browserDraftStorage, loadCanvasDocumentDraft } from '@/lib/canvas-draft-storage'
import { selectCanvasDocument } from '@/lib/canvas-document-selection'
import { mergeCanvasDocumentPage } from '@/lib/canvas-document-directory'
import { fromCanvasSnapshot, toCanvasSnapshot } from '@/lib/canvas-persistence'
import { useCanvasStore } from '@/stores/canvas-store'

const SAVE_DEBOUNCE_MS = 650
const CANVAS_DIRECTORY_PAGE_SIZE = 50

function assetUrl(asset: AssetItem): string | undefined {
  return asset.url ?? asset.downloadUrl ?? asset.thumbnailUrl
}

async function hydrateAssetUrls(document: CanvasDocument): Promise<CanvasDocument> {
  const ids = new Set<string>()
  for (const node of document.snapshot.nodes) {
    const data = node.data
    if (typeof data.resultAssetId === 'string') ids.add(data.resultAssetId)
    if (Array.isArray(data.referenceAssetIds)) {
      for (const value of data.referenceAssetIds) if (typeof value === 'string') ids.add(value)
    }
  }
  if (ids.size === 0) return document

  const assets = await Promise.all([...ids].map(async id => {
    try {
      return await apiClient.getAsset(id)
    } catch {
      return undefined
    }
  }))
  const urls = new Map(assets.flatMap(asset => {
    if (asset === undefined) return []
    const url = assetUrl(asset)
    return url === undefined ? [] : [[asset.id, url] as const]
  }))
  const assetById = new Map(assets.flatMap(asset => asset === undefined ? [] : [[asset.id, asset] as const]))
  return {
    ...document,
    snapshot: {
      ...document.snapshot,
      nodes: document.snapshot.nodes.map(node => {
        const data = node.data
        const resultUrl = typeof data.resultAssetId === 'string' ? urls.get(data.resultAssetId) : undefined
        const storedKinds = data.referenceAssetKinds
        const referenceAssetKinds: Record<string, 'image' | 'video'> = {}
        if (storedKinds !== null && typeof storedKinds === 'object' && !Array.isArray(storedKinds)) {
          for (const [assetId, kind] of Object.entries(storedKinds)) {
            if (kind === 'image' || kind === 'video') referenceAssetKinds[assetId] = kind
          }
        }
        if (Array.isArray(data.referenceAssetIds)) {
          for (const assetId of data.referenceAssetIds) {
            if (typeof assetId !== 'string') continue
            const asset = assetById.get(assetId)
            if (asset?.kind === 'image' || asset?.kind === 'video') referenceAssetKinds[assetId] = asset.kind
          }
        }
        return {
          ...node,
          data: {
            ...data,
            ...(resultUrl !== undefined ? { resultUrl } : {}),
            ...(Object.keys(referenceAssetKinds).length > 0 ? { referenceAssetKinds } : {}),
          },
        }
      }),
    },
  }
}

function applyDocument(document: CanvasDocument): void {
  const { nodes, edges } = fromCanvasSnapshot(document.snapshot)
  useCanvasStore.getState().setDocument({
    id: document.id,
    revision: document.revision,
    title: document.title,
    nodes,
    edges,
  })
}

function summaryOf(document: CanvasDocument): CanvasDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    revision: document.revision,
    updatedAt: document.updatedAt,
  }
}

function documentSignature(title: string, snapshot: ReturnType<typeof toCanvasSnapshot>): string {
  return JSON.stringify({ title, snapshot })
}

function applyCachedDocument(documentId: string, title: string, revision: number): boolean {
  const storage = browserDraftStorage()
  if (storage === undefined) return false
  const draft = loadCanvasDocumentDraft(storage, documentId)
  if (draft === null) return false
  useCanvasStore.getState().setDocument({
    id: documentId,
    revision: draft.revision ?? revision,
    title: draft.title ?? title,
    nodes: draft.nodes,
    edges: draft.edges,
  })
  return true
}

function shouldUseCachedDocument(error: unknown): boolean {
  return error instanceof ApiClientError
    && (error.code === 'NETWORK_ERROR' || (error.status !== undefined && error.status >= 500))
}

export function useCanvasPersistence() {
  const nodes = useCanvasStore(state => state.nodes)
  const edges = useCanvasStore(state => state.edges)
  const documentId = useCanvasStore(state => state.documentId)
  const revision = useCanvasStore(state => state.revision)
  const title = useCanvasStore(state => state.title)
  const hydrated = useCanvasStore(state => state.hydrated)
  const saveStatus = useCanvasStore(state => state.saveStatus)
  const setSaveStatus = useCanvasStore(state => state.setSaveStatus)
  const savingRef = useRef(false)
  const savePromiseRef = useRef<Promise<void> | undefined>(undefined)
  const saveTokenRef = useRef<symbol | undefined>(undefined)
  const operationEpochRef = useRef(0)
  const pendingSaveRef = useRef(false)
  const disposedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versionsRequestRef = useRef(0)
  const documentDirectoryRequestRef = useRef(0)
  const documentDirectoryLoadingRef = useRef(false)
  const [documents, setDocuments] = useState<CanvasDocumentSummary[]>([])
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState<string | undefined>()
  const [documentNextCursor, setDocumentNextCursor] = useState<string | undefined>()
  const [documentDirectoryLoading, setDocumentDirectoryLoading] = useState(false)
  const [documentDirectoryError, setDocumentDirectoryError] = useState<string | undefined>()
  const [versions, setVersions] = useState<CanvasVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | undefined>()
  const [saveTick, setSaveTick] = useState(0)
  const [lastSavedSignature, setLastSavedSignature] = useState<string | undefined>()

  const currentDocumentSignature = useMemo(
    () => documentSignature(title, toCanvasSnapshot(nodes, edges)),
    [edges, nodes, title],
  )
  const isDirty = hydrated
    && documentId !== undefined
    && currentDocumentSignature !== lastSavedSignature

  const invalidatePendingSave = useCallback(() => {
    operationEpochRef.current += 1
    pendingSaveRef.current = false
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const refreshDocument = useCallback(async () => {
    const id = useCanvasStore.getState().documentId
    if (id === undefined) return
    const activeSave = savePromiseRef.current
    invalidatePendingSave()
    const operationEpoch = operationEpochRef.current
    setSaveStatus('loading')
    try {
      // 先等已经发出的保存请求结束，再读取服务器版本，避免刷新拿到旧 revision
      // 后又被迟到的保存响应覆盖本地状态。
      if (activeSave !== undefined) await activeSave
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
      const document = await hydrateAssetUrls(await apiClient.getCanvas(id))
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
      setLastSavedSignature(documentSignature(document.title, document.snapshot))
      applyDocument(document)
      setDocuments(current => current.map(summary => summary.id === document.id ? summaryOf(document) : summary))
      setSaveStatus('saved')
    } catch (error) {
      if (!disposedRef.current) setSaveStatus('error')
      throw error
    }
  }, [invalidatePendingSave, setSaveStatus])

  const refreshVersions = useCallback(async (): Promise<CanvasVersion[]> => {
    const id = useCanvasStore.getState().documentId
    if (id === undefined) return []
    const requestId = versionsRequestRef.current + 1
    versionsRequestRef.current = requestId
    setVersionsLoading(true)
    setVersionsError(undefined)
    try {
      const nextVersions = await apiClient.listCanvasVersions(id, { limit: 30 })
      if (
        !disposedRef.current
        && versionsRequestRef.current === requestId
        && useCanvasStore.getState().documentId === id
      ) setVersions(nextVersions)
      return nextVersions
    } catch (error) {
      if (
        !disposedRef.current
        && versionsRequestRef.current === requestId
        && useCanvasStore.getState().documentId === id
      ) setVersionsError(error instanceof Error ? error.message : '版本历史加载失败')
      return []
    } finally {
      if (versionsRequestRef.current === requestId) {
        if (!disposedRef.current) setVersionsLoading(false)
      }
    }
  }, [])

  const restoreVersion = useCallback(async (versionId: string) => {
    const activeSave = savePromiseRef.current
    invalidatePendingSave()
    const operationEpoch = operationEpochRef.current
    if (activeSave !== undefined) await activeSave
    if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
    const state = useCanvasStore.getState()
    if (state.documentId === undefined || state.revision === undefined) return
    setSaveStatus('saving')
    try {
      const document = await hydrateAssetUrls(await apiClient.restoreCanvas(state.documentId, {
        versionId,
        expectedRevision: state.revision,
      }))
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
      setLastSavedSignature(documentSignature(document.title, document.snapshot))
      applyDocument(document)
      setDocuments(current => current.map(summary => summary.id === document.id ? summaryOf(document) : summary))
      setSaveStatus('saved')
      await refreshVersions()
    } catch (error) {
      if (!disposedRef.current && operationEpochRef.current === operationEpoch) {
        setSaveStatus(error instanceof ApiClientError && error.code === 'CANVAS_REVISION_CONFLICT' ? 'conflict' : 'error')
      }
      throw error
    }
  }, [invalidatePendingSave, refreshVersions, setSaveStatus])

  const openDocument = useCallback(async (nextDocumentId: string): Promise<boolean> => {
    const currentDocumentId = useCanvasStore.getState().documentId
    if (currentDocumentId === nextDocumentId) return true

    const activeSave = savePromiseRef.current
    invalidatePendingSave()
    const operationEpoch = operationEpochRef.current
    const summary = documents.find(document => document.id === nextDocumentId)
    setDocumentLoading(true)
    setDocumentError(undefined)
    try {
      if (activeSave !== undefined) await activeSave
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      const document = await apiClient.getCanvas(nextDocumentId)
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      const hydratedDocument = await hydrateAssetUrls(document)
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      setLastSavedSignature(documentSignature(hydratedDocument.title, hydratedDocument.snapshot))
      applyDocument(hydratedDocument)
      versionsRequestRef.current += 1
      setVersions([])
      setVersionsError(undefined)
      setVersionsLoading(false)
      setSaveStatus('saved')
      return true
    } catch (error) {
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      if (
        shouldUseCachedDocument(error)
        && applyCachedDocument(nextDocumentId, summary?.title ?? '未命名画布', summary?.revision ?? 1)
      ) {
        setLastSavedSignature(undefined)
        versionsRequestRef.current += 1
        setVersions([])
        setVersionsError(undefined)
        setVersionsLoading(false)
        setSaveStatus('error')
        return true
      }
      setDocumentError(error instanceof Error ? error.message : '画布加载失败')
      setSaveStatus('error')
      return false
    } finally {
      if (!disposedRef.current && operationEpochRef.current === operationEpoch) setDocumentLoading(false)
    }
  }, [documents, invalidatePendingSave, setSaveStatus])

  const createDocument = useCallback(async (): Promise<boolean> => {
    const activeSave = savePromiseRef.current
    invalidatePendingSave()
    const operationEpoch = operationEpochRef.current
    setDocumentLoading(true)
    setDocumentError(undefined)
    try {
      if (activeSave !== undefined) await activeSave
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      const document = await apiClient.createCanvas({
        title: '未命名画布',
        snapshot: { nodes: [], edges: [] },
      })
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      const hydratedDocument = await hydrateAssetUrls(document)
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      setLastSavedSignature(documentSignature(hydratedDocument.title, hydratedDocument.snapshot))
      applyDocument(hydratedDocument)
      versionsRequestRef.current += 1
      setDocuments(current => [
        summaryOf(hydratedDocument),
        ...current.filter(summary => summary.id !== hydratedDocument.id),
      ])
      setVersions([])
      setVersionsError(undefined)
      setVersionsLoading(false)
      setSaveStatus('saved')
      return true
    } catch (error) {
      if (!disposedRef.current && operationEpochRef.current === operationEpoch) {
        setDocumentError(error instanceof Error ? error.message : '新建画布失败')
        setSaveStatus('error')
      }
      return false
    } finally {
      if (!disposedRef.current && operationEpochRef.current === operationEpoch) setDocumentLoading(false)
    }
  }, [invalidatePendingSave, setSaveStatus])

  const loadMoreDocuments = useCallback(async (): Promise<boolean> => {
    const cursor = documentNextCursor
    if (cursor === undefined || documentDirectoryLoadingRef.current) return false
    const requestId = documentDirectoryRequestRef.current + 1
    documentDirectoryRequestRef.current = requestId
    documentDirectoryLoadingRef.current = true
    setDocumentDirectoryLoading(true)
    setDocumentDirectoryError(undefined)
    try {
      const page = await apiClient.listCanvases({ limit: CANVAS_DIRECTORY_PAGE_SIZE, cursor })
      if (
        disposedRef.current
        || documentDirectoryRequestRef.current !== requestId
      ) return false
      setDocuments(current => mergeCanvasDocumentPage(current, page))
      setDocumentNextCursor(page.nextCursor)
      return true
    } catch (error) {
      if (!disposedRef.current && documentDirectoryRequestRef.current === requestId) {
        setDocumentDirectoryError(error instanceof Error ? error.message : '画布目录加载失败')
      }
      return false
    } finally {
      if (documentDirectoryRequestRef.current === requestId) {
        documentDirectoryLoadingRef.current = false
        if (!disposedRef.current) setDocumentDirectoryLoading(false)
      }
    }
  }, [documentNextCursor])

  useEffect(() => {
    disposedRef.current = false
    const operationEpoch = operationEpochRef.current
    void (async () => {
      try {
        setDocumentLoading(true)
        setDocumentError(undefined)
        setSaveStatus('loading')
        const localSnapshot = toCanvasSnapshot(
          useCanvasStore.getState().nodes,
          useCanvasStore.getState().edges,
        )
        const requestId = documentDirectoryRequestRef.current + 1
        documentDirectoryRequestRef.current = requestId
        documentDirectoryLoadingRef.current = true
        setDocumentDirectoryLoading(true)
        setDocumentDirectoryError(undefined)
        const list = await apiClient.listCanvases({ limit: CANVAS_DIRECTORY_PAGE_SIZE })
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        if (documentDirectoryRequestRef.current !== requestId) return
        setDocuments(list.items)
        setDocumentNextCursor(list.nextCursor)
        setVersions([])
        setVersionsError(undefined)
        setVersionsLoading(false)
        const summary = selectCanvasDocument(list.items, useCanvasStore.getState().documentId)
        if (summary === undefined) {
          const document = await apiClient.createCanvas({ title: '未命名画布', snapshot: localSnapshot })
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          const hydratedDocument = await hydrateAssetUrls(document)
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          setLastSavedSignature(documentSignature(hydratedDocument.title, hydratedDocument.snapshot))
          applyDocument(hydratedDocument)
          setDocuments([summaryOf(hydratedDocument)])
          setDocumentNextCursor(undefined)
          setSaveStatus('saved')
          return
        }

        let document: CanvasDocument
        try {
          document = await apiClient.getCanvas(summary.id)
        }
        catch (error) {
          if (!shouldUseCachedDocument(error) || disposedRef.current || operationEpochRef.current !== operationEpoch) throw error
          if (!applyCachedDocument(summary.id, summary.title, summary.revision)) throw error
          setLastSavedSignature(undefined)
          setSaveStatus('error')
          return
        }
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        const hydratedDocument = await hydrateAssetUrls(document)
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        setLastSavedSignature(documentSignature(hydratedDocument.title, hydratedDocument.snapshot))
        applyDocument(hydratedDocument)
        setSaveStatus('saved')
      } catch (error) {
        if (!disposedRef.current) {
          const state = useCanvasStore.getState()
          if (
            shouldUseCachedDocument(error)
            && state.documentId !== undefined
            && applyCachedDocument(state.documentId, state.title, state.revision ?? 1)
          ) {
            setLastSavedSignature(undefined)
            setSaveStatus('error')
            return
          }
          useCanvasStore.setState({ hydrated: true })
          setDocumentError(error instanceof Error ? error.message : '画布加载失败')
          setSaveStatus('error')
        }
      } finally {
        documentDirectoryLoadingRef.current = false
        if (!disposedRef.current && documentDirectoryRequestRef.current > 0) setDocumentDirectoryLoading(false)
        if (!disposedRef.current && operationEpochRef.current === operationEpoch) setDocumentLoading(false)
      }
    })()
    return () => {
      disposedRef.current = true
      operationEpochRef.current += 1
      documentDirectoryRequestRef.current += 1
      documentDirectoryLoadingRef.current = false
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [setSaveStatus])

  useEffect(() => {
    if (!hydrated || documentId === undefined || revision === undefined) return
    const snapshot = toCanvasSnapshot(nodes, edges)
    const signature = documentSignature(title, snapshot)
    if (signature === lastSavedSignature) return
    if (savingRef.current) {
      pendingSaveRef.current = true
      return
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (savingRef.current) return
      savingRef.current = true
      setSaveStatus('saving')
      const operationEpoch = operationEpochRef.current
      const saveToken = Symbol('canvas-save')
      const savePromise = (async () => {
        try {
          const state = useCanvasStore.getState()
          if (state.documentId === undefined || state.revision === undefined) return
          const saved = await apiClient.saveCanvas(state.documentId, {
            expectedRevision: state.revision,
            title: state.title,
            snapshot,
          })
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          setLastSavedSignature(documentSignature(saved.title, saved.snapshot))
          useCanvasStore.getState().setRevision(saved.revision)
          setDocuments(current => current.map(summary => summary.id === saved.id ? summaryOf(saved) : summary))
          setSaveStatus('saved')
          if (documentSignature(
            useCanvasStore.getState().title,
            toCanvasSnapshot(useCanvasStore.getState().nodes, useCanvasStore.getState().edges),
          ) !== documentSignature(saved.title, saved.snapshot)) {
            setSaveStatus('saving')
          }
        } catch (error) {
          if (!disposedRef.current && operationEpochRef.current === operationEpoch) {
            setSaveStatus(error instanceof ApiClientError && error.code === 'CANVAS_REVISION_CONFLICT' ? 'conflict' : 'error')
          }
        } finally {
          savingRef.current = false
          if (saveTokenRef.current === saveToken) {
            saveTokenRef.current = undefined
            savePromiseRef.current = undefined
          }
          if (pendingSaveRef.current && !disposedRef.current && operationEpochRef.current === operationEpoch) {
            pendingSaveRef.current = false
            setSaveTick(tick => tick + 1)
          }
        }
      })()
      saveTokenRef.current = saveToken
      savePromiseRef.current = savePromise
      void savePromise
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [documentId, edges, hydrated, nodes, revision, saveTick, setSaveStatus, title])

  return {
    createDocument,
    documentError,
    documentLoading,
    documentDirectoryError,
    documentDirectoryLoading,
    documentNextCursor,
    documents,
    isDirty,
    loadMoreDocuments,
    openDocument,
    refreshDocument,
    refreshVersions,
    restoreVersion,
    saveStatus,
    versions,
    versionsError,
    versionsLoading,
  }
}
