import { describe, expect, it } from 'vitest'
import {
  canvasExecutionSessionKey,
  matchesCanvasExecutionSession,
  type CanvasExecutionSession,
} from './canvas-execution-session'

const session: CanvasExecutionSession = { documentId: 'doc-1', revision: 3 }

describe('canvas execution session', () => {
  it('使用文档和 revision 组成稳定 session key', () => {
    expect(canvasExecutionSessionKey(session)).toBe('doc-1:3')
    expect(canvasExecutionSessionKey({ ...session, revision: 4 })).not.toBe(canvasExecutionSessionKey(session))
  })

  it('只接受完全相同的文档执行会话', () => {
    expect(matchesCanvasExecutionSession(session, session)).toBe(true)
    expect(matchesCanvasExecutionSession({ documentId: 'doc-2', revision: 3 }, session)).toBe(false)
    expect(matchesCanvasExecutionSession({ documentId: 'doc-1', revision: 4 }, session)).toBe(false)
    expect(matchesCanvasExecutionSession(undefined, session)).toBe(false)
  })
})
