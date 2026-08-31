import type { ModelCategory } from '@bailian-studio/model-core'
import type { CanvasExecutionNodeRun } from '@bailian-studio/canvas-contracts'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'

export type GalleryVisibility = 'private' | 'public'
export type ArtifactKind = 'image' | 'video' | 'audio' | 'text' | 'archive'
export type ArtifactStatus = 'pending' | 'stored' | 'failed'
export type ArtifactStorageProvider = 'oss' | 'local'

export interface GenerationArtifact {
  id: string
  recordId: string
  userId: string
  kind: ArtifactKind
  sourceUrl?: string
  text?: string
  mimeType?: string
  storageProvider?: ArtifactStorageProvider
  storageKey?: string
  storageUrl?: string
  byteSize?: number
  status: ArtifactStatus
  errorJson?: Record<string, unknown>
  thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnailStorageProvider?: ArtifactStorageProvider
  thumbnailStorageKey?: string
  createdAt: string
  updatedAt: string
}

export interface AdminGalleryItem {
  id: string
  modelId: string
  category: ModelCategory
  author: { id: string; displayName: string | null }
  cover?: GenerationArtifact
  likeCount: number
  visibility: GalleryVisibility
  status: string
  hiddenAt?: string
  hiddenBy?: string
  createdAt: string
}

export interface ListAdminGalleryResult {
  items: AdminGalleryItem[]
  nextCursor?: string
}

/** 管理员查看指定用户资产时使用的内部只读投影；存储坐标由 API 层签发 URL。 */
export interface AdminAssetItem {
  id: string
  kind: ArtifactKind
  source: 'upload' | 'link' | 'generation' | 'derived'
  generationArtifactId?: string
  url?: string
  storageProvider?: string
  storageKey?: string
  thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnailStorageProvider?: string
  thumbnailStorageKey?: string
  text?: string
  mimeType?: string
  byteSize?: number
  durationSeconds?: number
  declaredResolution?: string
  fileName?: string
  recordId?: string
  modelId?: string
  createdAt: string
}

export interface AdminAssetListOptions {
  kind?: ArtifactKind
  source?: 'upload' | 'link' | 'generation' | 'derived'
  limit?: number
  cursor?: string
  q?: string
  sort?: 'time' | 'title' | 'size'
  modelIds?: readonly string[]
}

export interface ListAdminAssetsResult {
  items: AdminAssetItem[]
  nextCursor?: string
}

export interface GenerationInputAsset {
  generationId: string
  parameterName: string
  position: number
  assetId: string
  userId: string
  kind: 'image' | 'video' | 'audio' | 'text' | 'archive'
  source: 'upload' | 'link' | 'generation' | 'derived'
  storageProvider?: ArtifactStorageProvider
  storageKey?: string
  originalUrl?: string
}

export interface TaskDiagnosticError {
  category: TaskError['category']
  message: string
  retriable: boolean
  code?: string
}

export interface AdminTaskItem {
  id: string
  type: TaskRecord['type']
  domain: TaskRecord['domain']
  status: TaskRecord['status']
  priority: number
  attempts: number
  maxAttempts: number
  nextRunAt: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  recordId?: string
  userId?: string
  traceId?: string
  author?: { id: string; displayName: string | null }
  recordContext?: { modelId: string; category: ModelCategory }
  error?: TaskDiagnosticError
  durationMs?: number
}

export interface ListAdminTasksResult {
  items: AdminTaskItem[]
  nextCursor?: string
}

export interface AdminTaskRequestContextRecord {
  id: string
  modelId: string
  category: ModelCategory
  inputParams: Record<string, unknown>
  inputAssets: GenerationInputAsset[]
}

export interface AdminCanvasTaskNode {
  nodeId: string
  kind: 'image' | 'video'
  modelId: string
  params: Record<string, unknown>
  assetRefs: Record<string, string[]>
  dependencyBindings: Record<string, string[]>
  dependsOn: string[]
  status: CanvasExecutionNodeRun['status']
  generationId?: string
  assetIds?: string[]
  cacheHit?: boolean
  startedAt?: string
  completedAt?: string
  durationMs?: number
  errorCode?: string
  error?: string
  generationStatus?: string
  /** 本次 Canvas 执行实际承担的费用；缓存复用或 provenance 缺失时为 0。 */
  accountedCents: number
}

/** Canvas 节点输出资产的 admin 内部只读投影；存储坐标只供 API 生成短期 read URL。 */
export interface AdminCanvasTaskAsset {
  id: string
  kind: ArtifactKind
  source: 'upload' | 'link' | 'generation' | 'derived'
  storageProvider?: string
  storageKey?: string
  thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnailStorageProvider?: string
  thumbnailStorageKey?: string
  text?: string
  mimeType?: string
  byteSize?: number
  fileName?: string
  recordId?: string
  modelId?: string
  createdAt: string
}

export interface AdminCanvasTaskContext {
  documentId: string
  documentRevision: number
  cachePolicy?: 'reuse' | 'refresh'
  rerun?: {
    sourceExecutionId: string
    nodeId: string
  }
  assets: AdminCanvasTaskAsset[]
  nodes: AdminCanvasTaskNode[]
}

export interface AdminTaskRequestContext {
  task: TaskRecord
  record?: AdminTaskRequestContextRecord
  canvas?: AdminCanvasTaskContext
}

export interface GenerationCallStats {
  total: number
  byModel: Array<{ modelId: string; count: number }>
  byHour: Array<{ hour: number; modelId: string; count: number }>
}

export interface ModelCost {
  modelId: string
  unitCostCents: number
  currency: string
  updatedAt: string
}

export interface CostMarginRow {
  modelId: string
  calls: number
  revenueCents: number
  unitCostCents: number
  costCents: number
  marginCents: number
}

export interface RetentionAnalytics {
  firstGeneration: number
  firstSuccess: number
  activeTwoDays: number
}

/** Canvas 窗口内的执行成本概览；generationCalls 只统计实际创建的子 generation。 */
export interface CanvasCostAnalytics {
  executions: number
  generationCalls: number
  cacheHitNodes: number
  accountedCents: number
  byModel: Array<{
    modelId: string
    calls: number
    accountedCents: number
  }>
}

/** Canvas 窗口内的执行健康度概览；耗时只来自已有 task 生命周期时间戳。 */
export interface CanvasOperationsAnalytics {
  executions: number
  byStatus: Array<{ status: TaskRecord['status']; count: number }>
  terminalExecutions: number
  succeededExecutions: number
  successRate: number
  averageDurationMs: number | null
  p95DurationMs: number | null
  failureReasons: Array<{ reason: string; count: number }>
  nodeFailureReasons: Array<{ reason: string; count: number }>
}
