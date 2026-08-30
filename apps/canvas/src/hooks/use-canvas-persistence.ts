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
import { fromCanvasSnapshot, toCanvasSnapshot } from '@/lib/canvas-persistence'
import { useCanvasStore } from '@/stores/canvas-store'

const SAVE_DEBOUNCE_MS = 650

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
  const hydrated = useCanvasStore(state => state.hydrated)
  const saveStatus = useCanvasStore(state => state.saveStatus)
  const setSaveStatus = useCanvasStore(state => state.setSaveStatus)
  const lastSavedSignature = useRef<string | undefined>(undefined)
  const savingRef = useRef(false)
  const savePromiseRef = useRef<Promise<void> | undefined>(undefined)
  const saveTokenRef = useRef<symbol | undefined>(undefined)
  const operationEpochRef = useRef(0)
  const pendingSaveRef = useRef(false)
  const disposedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const versionsRequestRef = useRef(0)
  const [documents, setDocuments] = useState<CanvasDocumentSummary[]>([])
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState<string | undefined>()
  const [versions, setVersions] = useState<CanvasVersion[]>([])
  const [saveTick, setSaveTick] = useState(0)

  const currentSnapshotSignature = useMemo(
    () => JSON.stringify(toCanvasSnapshot(nodes, edges)),
    [edges, nodes],
  )
  const isDirty = hydrated
    && documentId !== undefined
    && currentSnapshotSignature !== lastSavedSignature.current

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
      applyDocument(document)
      lastSavedSignature.current = JSON.stringify(document.snapshot)
      setDocuments(current => current.map(summary => summary.id === document.id ? summaryOf(document) : summary))
      setSaveStatus('saved')
    } catch (error) {
      if (!disposedRef.current) setSaveStatus('error')
      throw error
    }
  }, [invalidatePendingSave, setSaveStatus])

  const refreshVersions = useCallback(async () => {
    const id = useCanvasStore.getState().documentId
    if (id === undefined) return []
    const requestId = versionsRequestRef.current + 1
    versionsRequestRef.current = requestId
    const nextVersions = await apiClient.listCanvasVersions(id, { limit: 30 })
    if (
      !disposedRef.current
      && versionsRequestRef.current === requestId
      && useCanvasStore.getState().documentId === id
    ) setVersions(nextVersions)
    return nextVersions
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
    const document = await hydrateAssetUrls(await apiClient.restoreCanvas(state.documentId, {
      versionId,
      expectedRevision: state.revision,
    }))
    if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
    applyDocument(document)
    lastSavedSignature.current = JSON.stringify(document.snapshot)
    setDocuments(current => current.map(summary => summary.id === document.id ? summaryOf(document) : summary))
    setSaveStatus('saved')
    await refreshVersions()
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
      applyDocument(hydratedDocument)
      lastSavedSignature.current = JSON.stringify(hydratedDocument.snapshot)
      versionsRequestRef.current += 1
      setVersions([])
      setSaveStatus('saved')
      return true
    } catch (error) {
      if (disposedRef.current || operationEpochRef.current !== operationEpoch) return false
      if (
        shouldUseCachedDocument(error)
        && applyCachedDocument(nextDocumentId, summary?.title ?? '未命名画布', summary?.revision ?? 1)
      ) {
        lastSavedSignature.current = undefined
        versionsRequestRef.current += 1
        setVersions([])
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
      applyDocument(hydratedDocument)
      lastSavedSignature.current = JSON.stringify(hydratedDocument.snapshot)
      versionsRequestRef.current += 1
      setDocuments(current => [
        summaryOf(hydratedDocument),
        ...current.filter(summary => summary.id !== hydratedDocument.id),
      ])
      setVersions([])
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
        const list = await apiClient.listCanvases({ limit: 100 })
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        setDocuments(list.items)
        const summary = selectCanvasDocument(list.items, useCanvasStore.getState().documentId)
        if (summary === undefined) {
          const document = await apiClient.createCanvas({ title: '未命名画布', snapshot: localSnapshot })
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          const hydratedDocument = await hydrateAssetUrls(document)
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          applyDocument(hydratedDocument)
          lastSavedSignature.current = JSON.stringify(hydratedDocument.snapshot)
          setDocuments([summaryOf(hydratedDocument)])
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
          lastSavedSignature.current = undefined
          setSaveStatus('error')
          return
        }
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        const hydratedDocument = await hydrateAssetUrls(document)
        if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
        applyDocument(hydratedDocument)
        lastSavedSignature.current = JSON.stringify(hydratedDocument.snapshot)
        setSaveStatus('saved')
      } catch (error) {
        if (!disposedRef.current) {
          const state = useCanvasStore.getState()
          if (
            shouldUseCachedDocument(error)
            && state.documentId !== undefined
            && applyCachedDocument(state.documentId, state.title, state.revision ?? 1)
          ) {
            lastSavedSignature.current = undefined
            setSaveStatus('error')
            return
          }
          useCanvasStore.setState({ hydrated: true })
          setDocumentError(error instanceof Error ? error.message : '画布加载失败')
          setSaveStatus('error')
        }
      } finally {
        if (!disposedRef.current && operationEpochRef.current === operationEpoch) setDocumentLoading(false)
      }
    })()
    return () => {
      disposedRef.current = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [setSaveStatus])

  useEffect(() => {
    if (!hydrated || documentId === undefined || revision === undefined) return
    const snapshot = toCanvasSnapshot(nodes, edges)
    const signature = JSON.stringify(snapshot)
    if (signature === lastSavedSignature.current) return
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
            snapshot,
          })
          if (disposedRef.current || operationEpochRef.current !== operationEpoch) return
          useCanvasStore.getState().setRevision(saved.revision)
          lastSavedSignature.current = JSON.stringify(saved.snapshot)
          setDocuments(current => current.map(summary => summary.id === saved.id ? summaryOf(saved) : summary))
          setSaveStatus('saved')
          if (JSON.stringify(toCanvasSnapshot(
            useCanvasStore.getState().nodes,
            useCanvasStore.getState().edges,
          )) !== lastSavedSignature.current) {
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
  }, [documentId, edges, hydrated, nodes, revision, saveTick, setSaveStatus])

  return {
    createDocument,
    documentError,
    documentLoading,
    documents,
    isDirty,
    openDocument,
    refreshDocument,
    refreshVersions,
    restoreVersion,
    saveStatus,
    versions,
  }
}
