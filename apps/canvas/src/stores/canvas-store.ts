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

/**
 * 画布状态（Krea 式）：节点 + 边 + localStorage 持久化。
 *
 * MVP 用 localStorage；后端 canvas 文档 API（revision 并发）上线后切到
 * 服务端持久化，接口形状不变（batch 2 后半段）。
 */

const STORAGE_KEY = 'bailian-studio:canvas:v1'

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: Node) => void
  updateNodeData: (id: string, data: Partial<Node['data']>) => void
  removeNode: (id: string) => void
  clear: () => void
}

function loadFromStorage(): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
    return parsed
  }
  catch {
    return null
  }
}

function saveToStorage(nodes: Node[], edges: Edge[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }))
  }
  catch {
    // QuotaExceeded 等：静默，画布仍可交互
  }
}

function persist(get: () => CanvasState): void {
  saveToStorage(get().nodes, get().edges)
}

const initial = loadFromStorage()

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initial?.nodes ?? [],
  edges: initial?.edges ?? [],

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
    set({ nodes: [], edges: [] })
    localStorage.removeItem(STORAGE_KEY)
  },
}))
