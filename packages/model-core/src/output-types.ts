/**
 * Provider 完成一次生成后的统一产出物。
 *
 * provider adapter 负责把原始响应归一化为这个形状；worker、repository 和
 * API 编排层只消费该契约，不需要知道具体 provider 的响应字段路径。
 */
export interface NormalizedArtifact {
  readonly kind: 'image' | 'video' | 'audio' | 'text' | 'archive'
  readonly sourceUrl?: string
  readonly text?: string
  readonly mimeType?: string
  readonly providerMeta?: unknown
}

/** 归一化输出：产物列表 + 可选用量与原始响应诊断信息。 */
export interface NormalizedOutput {
  readonly artifacts: readonly NormalizedArtifact[]
  readonly usage?: unknown
  readonly raw: unknown
}
