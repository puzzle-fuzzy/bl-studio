import { describe, expect, it } from 'vitest'
import {
  matchesCanvasGenerationSession,
  type CanvasGenerationSession,
} from './canvas-generation-session'

const session: CanvasGenerationSession = { documentId: 'doc-1', nodeId: 'node-1' }

describe('canvas generation session', () => {
  it('要求文档和节点都保持一致', () => {
    expect(matchesCanvasGenerationSession(session, session)).toBe(true)
    expect(matchesCanvasGenerationSession({ documentId: 'doc-2', nodeId: 'node-1' }, session)).toBe(false)
    expect(matchesCanvasGenerationSession({ documentId: 'doc-1', nodeId: 'node-2' }, session)).toBe(false)
  })

  it('允许未完成服务端绑定的同一节点继续使用本地会话', () => {
    expect(matchesCanvasGenerationSession({ documentId: undefined, nodeId: 'node-1' }, {
      documentId: undefined,
      nodeId: 'node-1',
    })).toBe(true)
    expect(matchesCanvasGenerationSession(undefined, session)).toBe(false)
  })
})
