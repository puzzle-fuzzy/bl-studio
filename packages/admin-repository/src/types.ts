import type { ModelCategory } from '@bailian-studio/model-core'
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

export interface AdminTaskRequestContext {
  task: TaskRecord
  record?: AdminTaskRequestContextRecord
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
