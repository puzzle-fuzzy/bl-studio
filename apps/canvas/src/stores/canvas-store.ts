import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { registerPrivateDataReset } from '@bailian-studio/app-shell'
import {
  browserDraftStorage,
  clearAllCanvasDrafts,
  clearCanvasDraft,
  loadCanvasBootstrapDraft,
  loadSelectedCanvasDocumentId,
  writeCanvasDraft,
  writeSelectedCanvasDocumentId,
} from '@/lib/canvas-draft-storage'

/**
 * 画布状态（Krea 式）：节点 + 边 + 服务端持久化，localStorage 仅作离线草稿兜底。
 *
 * 服务端 canvas 文档 API 负责 revision 并发和版本历史；localStorage 只保留
 * 当前编辑快照，避免网络异常时立即丢失画布操作。
 */

export type CanvasSaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'conflict' | 'error'
export type CanvasExecutionBusy = boolean

export interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  documentId?: string
  revision?: number
  title: string
  hydrated: boolean
  saveStatus: CanvasSaveStatus
  /** Canvas 级 Worker 任务进行中时，阻止节点快捷生成与之并发写入结果。 */
  canvasExecutionBusy: CanvasExecutionBusy
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: Node) => void
  selectNode: (id: string) => void
  updateNodeData: (id: string, data: Partial<Node['data']>) => void
  removeNode: (id: string) => void
  clear: () => void
  setDocument: (input: {
    id: string
    revision: number
    title: string
    nodes: Node[]
    edges: Edge[]
  }) => void
  setRevision: (revision: number) => void
  setSaveStatus: (status: CanvasSaveStatus) => void
  setCanvasExecutionBusy: (busy: CanvasExecutionBusy) => void
}

function persist(get: () => CanvasState): void {
  const storage = browserDraftStorage()
  if (storage === undefined) return
  const state = get()
  try {
    writeCanvasDraft(storage, {
      ...(state.documentId === undefined ? {} : { documentId: state.documentId }),
      ...(state.revision === undefined ? {} : { revision: state.revision }),
      title: state.title,
      nodes: state.nodes,
      edges: state.edges,
    })
  }
  catch {
    // QuotaExceeded 等：静默，画布仍可交互
  }
}

const draftStorage = browserDraftStorage()
const initial = draftStorage === undefined ? null : loadCanvasBootstrapDraft(draftStorage)
const initialSelectedDocumentId = draftStorage === undefined
  ? undefined
  : loadSelectedCanvasDocumentId(draftStorage)

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initial?.nodes ?? [],
  edges: initial?.edges ?? [],
  ...((initial?.documentId ?? initialSelectedDocumentId) === undefined
    ? {}
    : { documentId: initial?.documentId ?? initialSelectedDocumentId }),
  ...(initial?.revision === undefined ? {} : { revision: initial.revision }),
  title: initial?.title ?? '未命名画布',
  hydrated: false,
  saveStatus: 'idle',
  canvasExecutionBusy: false,

  onNodesChange: (changes) => {
    set(state => ({ nodes: applyNodeChanges(changes, state.nodes) }))
    persist(get)
  },

  onEdgesChange: (changes) => {
    set(state => ({ edges: applyEdgeChanges(changes, state.edges) }))
    persist(get)
  },

  onConnect: (connection) => {
    if (connection.source === connection.target || connection.source === '' || connection.target === '') return
    set(state => {
      const duplicate = state.edges.some(edge => (
        edge.source === connection.source
        && edge.target === connection.target
        && edge.sourceHandle === connection.sourceHandle
        && edge.targetHandle === connection.targetHandle
      ))
      if (duplicate) return state
      return { edges: addEdge({ ...connection, animated: true }, state.edges) }
    })
    persist(get)
  },

  addNode: (node) => {
    set(state => ({ nodes: [...state.nodes, node] }))
    persist(get)
  },

  selectNode: (id) => {
    set(state => ({
      nodes: state.nodes.map(node => ({
        ...node,
        selected: node.id === id,
      })),
    }))
  },

  updateNodeData: (id, data) => {
    set(state => ({
      nodes: state.nodes.map(node =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
      ),
    }))
    persist(get)
  },

  removeNode: (id) => {
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== id),
      edges: state.edges.filter(edge => edge.source !== id && edge.target !== id),
    }))
    persist(get)
  },

  clear: () => {
    const documentId = get().documentId
    set({ nodes: [], edges: [], canvasExecutionBusy: false })
    const storage = browserDraftStorage()
    if (storage !== undefined) clearCanvasDraft(storage, documentId)
  },

  setDocument: ({ id, revision, title, nodes, edges }) => {
    set({ documentId: id, revision, title, nodes, edges, hydrated: true, canvasExecutionBusy: false })
    const storage = browserDraftStorage()
    if (storage === undefined) return
    try {
      writeCanvasDraft(storage, { documentId: id, revision, title, nodes, edges })
      writeSelectedCanvasDocumentId(storage, id)
    }
    catch {
      // QuotaExceeded 等：服务端文档仍是权威状态
    }
  },

  setRevision: (revision) => set({ revision }),

  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setCanvasExecutionBusy: (canvasExecutionBusy) => set({ canvasExecutionBusy }),
}))

registerPrivateDataReset(() => {
  const storage = browserDraftStorage()
  if (storage !== undefined) clearAllCanvasDrafts(storage)
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    documentId: undefined,
    revision: undefined,
    title: '未命名画布',
    hydrated: false,
    saveStatus: 'idle',
    canvasExecutionBusy: false,
  })
})
