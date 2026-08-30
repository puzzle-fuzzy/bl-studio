import type { CanvasDocumentSummary } from '@bailian-studio/api-client'

/** 在已加载的目录中恢复上次选择，否则使用服务端排序后的第一份文档。 */
export function selectCanvasDocument(
  documents: readonly CanvasDocumentSummary[],
  preferredDocumentId?: string,
): CanvasDocumentSummary | undefined {
  if (preferredDocumentId !== undefined) {
    const preferred = documents.find(document => document.id === preferredDocumentId)
    if (preferred !== undefined) return preferred
  }
  return documents[0]
}
