/**
 * 用户资产相关的领域类型。
 *
 * 定义 UnifiedAssetItem（合并 user_assets 与 generation_artifacts 的统一视图）、
 * CreateUserAssetInput（写入 user_assets 表时的输入）等类型，供 repository 层
 * 的 createUserAsset / listUnifiedAssets 方法使用。
 *
 * 媒体种类复用 types.ts 的 ArtifactKind，不重复定义。
 */

import type { ArtifactKind } from './types'

export type AssetSource = 'upload' | 'link' | 'generation' | 'derived'
export type AssetDerivativeStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type AssetSort = 'time' | 'title' | 'size'

/**
 * 统一的资产项，合并 user_assets（上传/导入/派生）与 generation_artifacts（生成）。
 * source 标明来源，不同来源携带不同的可选字段。
 */
export interface UnifiedAssetItem {
  id: string
  kind: ArtifactKind
  source: AssetSource
  generationArtifactId?: string
  url?: string
  /** Internal storage coordinates; API layers turn these into a fresh read URL. */
  storageProvider?: string
  storageKey?: string
  /** Internal derivative coordinates; API layers turn these into a read URL. */
  thumbnailStatus?: AssetDerivativeStatus
  thumbnailStorageProvider?: string
  thumbnailStorageKey?: string
  text?: string          // 仅 generation 来源的文本产物（直接落库不走存储）
  mimeType?: string
  byteSize?: number
  durationSeconds?: number
  /** Declared generation/storage metadata; not a measured output dimension. */
  declaredResolution?: string
  fileName?: string       // 仅 upload/link 来源
  recordId?: string       // 仅 generation 来源
  modelId?: string        // 仅 generation 来源
  createdAt: string
}

export interface ListUnifiedAssetsOptions {
  kind?: ArtifactKind
  source?: AssetSource
  limit?: number
  cursor?: string
  q?: string
  sort?: AssetSort
  /** Model IDs whose display names matched q at the caller boundary. */
  modelIds?: readonly string[]
}

export interface ListUnifiedAssetsResult {
  items: UnifiedAssetItem[]
  nextCursor?: string
}

/** 插入 user_assets 行时的输入参数（createUserAsset 用）。 */
export interface CreateUserAssetInput {
  id: string
  userId: string
  kind: ArtifactKind
  source: AssetSource
  generationArtifactId?: string
  recordId?: string
  modelId?: string
  fileName?: string
  originalUrl?: string
  mimeType?: string
  byteSize?: number
  storageProvider?: string
  storageKey?: string
  storageUrl?: string
  metadata?: Record<string, unknown>
  /** Create the asset and its durable thumbnail task in one transaction. */
  enqueueThumbnail?: boolean
  traceId?: string
  now?: string
}

export interface AssetThumbnailSource {
  derivativeId: string
  assetId: string
  userId: string
  kind: Extract<ArtifactKind, 'image' | 'video'>
  source: AssetSource
  storageProvider?: string
  storageKey?: string
  originalUrl?: string
  fileName?: string
  mimeType?: string
  byteSize?: number
  status: AssetDerivativeStatus
}

export interface MarkAssetThumbnailProcessingInput {
  derivativeId: string
  now?: string
}

export interface CompleteAssetThumbnailInput {
  derivativeId: string
  storageProvider: string
  storageKey: string
  mimeType: string
  byteSize: number
  metadata?: Record<string, unknown>
  now?: string
}

export interface FailAssetThumbnailInput {
  derivativeId: string
  error: Record<string, unknown>
  retrying?: boolean
  now?: string
}
