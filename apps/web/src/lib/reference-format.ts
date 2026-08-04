import type { ModelCatalogItem } from '@bailian-studio/api-client'

/**
 * 提示词中的参考图引用转换（纯函数）。
 *
 * 编辑器内部使用中性的 `@图N` 标记（N 为 1-based 序号），提交时按模型的
 * `referenceFormat` 转换为 provider 语法；重试/回显时反向还原为标记，以便
 * 渲染为可视化 chip。三种格式：
 * - angle-bracket：`<<<image_1>>>`
 * - image-bracket：`[Image 1]`
 * - chinese：`图1`
 */

export type ReferenceFormat = 'angle-bracket' | 'image-bracket' | 'chinese'

export const REFERENCE_FORMAT_LABELS: Record<ReferenceFormat, string> = {
  'angle-bracket': '尖括号',
  'image-bracket': '方括号',
  chinese: '中文',
}

export function referenceMarker(index: number): string {
  return `@图${index}`
}

export function referenceFormatOf(model: Pick<ModelCatalogItem, 'referenceFormat'> | undefined): ReferenceFormat {
  return model?.referenceFormat ?? 'angle-bracket'
}

export function providerSyntaxFor(format: ReferenceFormat, index: number): string {
  switch (format) {
    case 'angle-bracket':
      return `<<<image_${index}>>>`
    case 'image-bracket':
      return `[Image ${index}]`
    case 'chinese':
      return `图${index}`
  }
}

const MARKER_REGEX = /@图(\d+)/g

/** 把编辑器内 `@图N` 标记解析为模型要求的 provider 语法。 */
export function resolvePromptReferences(prompt: string, format: ReferenceFormat): string {
  return prompt.replace(MARKER_REGEX, (_match, raw: string) => {
    const index = Number(raw)
    return Number.isFinite(index) ? providerSyntaxFor(format, index) : _match
  })
}

/** 把 provider 语法还原为 `@图N` 标记（供回显/重试）。 */
export function restorePromptReferences(prompt: string, format: ReferenceFormat): string {
  const pattern =
    format === 'angle-bracket' ? /<<<image_(\d+)>>>/g
      : format === 'image-bracket' ? /\[Image (\d+)\]/g
        : /图(\d+)/g
  return prompt.replace(pattern, (_match, raw: string) => {
    const index = Number(raw)
    return Number.isFinite(index) ? referenceMarker(index) : _match
  })
}

/** 解析后的 provider 长度（用于字数统计与 maxLength 校验）。 */
export function resolvedPromptLength(prompt: string, format: ReferenceFormat): number {
  return resolvePromptReferences(prompt, format).length
}

/** 从一段提示词中提取全部引用序号（按出现顺序去重）。 */
export function extractReferenceIndexes(prompt: string): number[] {
  const indexes: number[] = []
  for (const match of prompt.matchAll(MARKER_REGEX)) {
    const index = Number(match[1])
    if (Number.isFinite(index) && !indexes.includes(index)) indexes.push(index)
  }
  return indexes
}
