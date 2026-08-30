export interface CanvasExecutionSession {
  documentId: string
  revision: number
}

export function canvasExecutionSessionKey(session: CanvasExecutionSession): string {
  return `${session.documentId}:${session.revision}`
}

export function matchesCanvasExecutionSession(
  current: CanvasExecutionSession | undefined,
  expected: CanvasExecutionSession,
): boolean {
  return current?.documentId === expected.documentId && current.revision === expected.revision
}
