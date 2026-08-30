import type { AssetItem } from '@bailian-studio/api-client'
import { parsePromptReferences, type ReferenceFormat } from '@/lib/reference-format'
import { resolveApiUrl } from '@/lib/api'

/**
 * 提示词段渲染：参考图标记（`[Image N]` / `<<<image_N>>>` / `图N`）就地替换为
 * 内联缩略图；资产未就绪/缺失时保留原始标记文本，加载完成后自动替换。
 * 标记序号 N 对应 references 参考池下标 N-1。
 */
export function PromptSegments({
  prompt,
  format,
  pool,
  refAssets,
}: {
  prompt: string
  format: ReferenceFormat | undefined
  /** references 参考池的资产 id 顺序（标记序号 N → pool[N-1]）。 */
  pool: readonly string[]
  refAssets: Record<string, AssetItem>
}) {
  const segments = parsePromptReferences(prompt, format)
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.text}</span>
        }
        const assetId = segment.index !== undefined ? pool[segment.index - 1] : undefined
        const asset = assetId !== undefined ? refAssets[assetId] : undefined
        const src = asset?.thumbnailUrl ?? asset?.url ?? undefined
        if (src !== undefined && src !== '') {
          return (
            <img
              key={index}
              src={resolveApiUrl(src)}
              alt={`参考图 ${segment.index ?? ''}`}
              loading="lazy"
              className="inline-block size-4 rounded-sm object-cover align-middle ring-1 ring-border"
            />
          )
        }
        return <span key={index}>{segment.raw}</span>
      })}
    </>
  )
}
