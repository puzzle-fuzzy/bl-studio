import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'

export type MediaOperation = 'video.extract_audio' | 'video.assemble'
export type MediaJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
export type MediaSourceKind = 'image' | 'video' | 'audio'
export type MediaOutputKind = 'image' | 'video' | 'audio' | 'text'

export interface MediaJob {
  id: string
  userId: string
  operation: MediaOperation
  status: MediaJobStatus
  sourceAssetId?: string
  sourceKind: MediaSourceKind
  outputAssetId?: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: TaskError
  createdAt: string
  updatedAt: string
}

export interface CreateMediaJobInput {
  userId: string
  operation: MediaOperation
  source: {
    assetId: string
    kind: MediaSourceKind
    fileName?: string
  }
  assembly?: {
    videoSources: Array<{
      assetId: string
      kind: 'video'
      fileName?: string
    }>
    musicSource?: {
      assetId: string
      kind: 'audio'
      fileName?: string
    }
  }
  options?: Record<string, unknown>
  idempotencyKey?: string
  /** 辅助媒体动作对应的一条生命周期 trace。 */
  traceId?: string
  now?: string
}

export interface MediaSource {
  storageProvider: string
  storageKey: string
  fileName: string
  mimeType: string
  byteSize: number
}

export interface MediaCompositeSource extends MediaSource {
  assetId: string
  kind: MediaSourceKind
}

export interface CreateMediaJobResult {
  job: MediaJob
  task: TaskRecord
}

export interface GetMediaJobInput {
  userId: string
  jobId: string
}

export interface CompleteMediaJobInput {
  jobId: string
  outputAsset: {
    id: string
    kind: MediaOutputKind
    fileName: string
    mimeType: string
    byteSize: number
    storageProvider: string
    storageKey: string
    storageUrl?: string
    metadata?: Record<string, unknown>
  }
  output?: Record<string, unknown>
  now?: string
}

export interface FailMediaJobInput {
  jobId: string
  error: TaskError
  now?: string
  /** 瞬时失败要重试时置 true：job 回到 queued（而非 failed），允许下次任务重新跑。 */
  retrying?: boolean
}
