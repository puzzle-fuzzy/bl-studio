export interface CanvasGenerationSession {
  documentId: string | undefined
  nodeId: string
}

export function matchesCanvasGenerationSession(
  current: CanvasGenerationSession | undefined,
  expected: CanvasGenerationSession,
): boolean {
  return current?.documentId === expected.documentId && current.nodeId === expected.nodeId
}
