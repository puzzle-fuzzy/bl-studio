import type { CanvasDocumentSummary, ListCanvasesResult } from '@bailian-studio/api-client'

/** 合并服务端目录分页，保持服务端顺序并避免重复文档。 */
export function mergeCanvasDocumentPage(
  current: readonly CanvasDocumentSummary[],
  page: ListCanvasesResult,
): CanvasDocumentSummary[] {
  const documents = new Map(current.map(document => [document.id, document]))
  for (const document of page.items) documents.set(document.id, document)
  return [...documents.values()]
}
