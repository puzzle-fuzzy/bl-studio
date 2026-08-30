import { ApiClientError, type AssetItem, type CanvasDocument, type CanvasVersion } from '@bailian-studio/api-client'
import { apiClient } from '@bailian-studio/lib-client'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const pendingSaveRef = useRef(false)
  const disposedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [versions, setVersions] = useState<CanvasVersion[]>([])
  const [saveTick, setSaveTick] = useState(0)

  const refreshDocument = useCallback(async () => {
    const id = useCanvasStore.getState().documentId
    if (id === undefined) return
    setSaveStatus('loading')
    const document = await hydrateAssetUrls(await apiClient.getCanvas(id))
    if (disposedRef.current) return
    applyDocument(document)
    lastSavedSignature.current = JSON.stringify(document.snapshot)
    setSaveStatus('saved')
  }, [setSaveStatus])

  const refreshVersions = useCallback(async () => {
    const id = useCanvasStore.getState().documentId
    if (id === undefined) return []
    const nextVersions = await apiClient.listCanvasVersions(id, { limit: 30 })
    if (!disposedRef.current) setVersions(nextVersions)
    return nextVersions
  }, [])

  const restoreVersion = useCallback(async (versionId: string) => {
    const state = useCanvasStore.getState()
    if (state.documentId === undefined || state.revision === undefined) return
    setSaveStatus('saving')
    const document = await hydrateAssetUrls(await apiClient.restoreCanvas(state.documentId, {
      versionId,
      expectedRevision: state.revision,
    }))
    if (disposedRef.current) return
    applyDocument(document)
    lastSavedSignature.current = JSON.stringify(document.snapshot)
    setSaveStatus('saved')
    await refreshVersions()
  }, [refreshVersions, setSaveStatus])

  useEffect(() => {
    disposedRef.current = false
    void (async () => {
      try {
        setSaveStatus('loading')
        const localSnapshot = toCanvasSnapshot(
          useCanvasStore.getState().nodes,
          useCanvasStore.getState().edges,
        )
        const list = await apiClient.listCanvases({ limit: 1 })
        const document = list.items[0] === undefined
          ? await apiClient.createCanvas({ title: '未命名画布', snapshot: localSnapshot })
          : await apiClient.getCanvas(list.items[0].id)
        if (disposedRef.current) return
        const hydratedDocument = await hydrateAssetUrls(document)
        if (disposedRef.current) return
        applyDocument(hydratedDocument)
        lastSavedSignature.current = JSON.stringify(hydratedDocument.snapshot)
        setSaveStatus('saved')
      } catch {
        if (!disposedRef.current) {
          useCanvasStore.setState({ hydrated: true })
          setSaveStatus('error')
        }
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
      void (async () => {
        try {
          const state = useCanvasStore.getState()
          if (state.documentId === undefined || state.revision === undefined) return
          const saved = await apiClient.saveCanvas(state.documentId, {
            expectedRevision: state.revision,
            snapshot,
          })
          if (disposedRef.current) return
          useCanvasStore.getState().setRevision(saved.revision)
          lastSavedSignature.current = JSON.stringify(saved.snapshot)
          setSaveStatus('saved')
          if (JSON.stringify(toCanvasSnapshot(
            useCanvasStore.getState().nodes,
            useCanvasStore.getState().edges,
          )) !== lastSavedSignature.current) {
            setSaveStatus('saving')
          }
        } catch (error) {
          if (!disposedRef.current) setSaveStatus(error instanceof ApiClientError && error.code === 'CANVAS_REVISION_CONFLICT' ? 'conflict' : 'error')
        } finally {
          savingRef.current = false
          if (pendingSaveRef.current && !disposedRef.current) {
            pendingSaveRef.current = false
            setSaveTick(tick => tick + 1)
          }
        }
      })()
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [documentId, edges, hydrated, nodes, revision, saveTick, setSaveStatus])

  return { saveStatus, versions, refreshDocument, refreshVersions, restoreVersion }
}
