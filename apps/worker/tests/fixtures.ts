/**
 * worker 包的共享测试 fixtures：内存版 repository/provider 替身与结构化日志捕获。
 * 手写且类型完备（无类型断言）。
 */
import type {
  AuditLog,
  AssetThumbnailSource,
  CancelGenerationInput,
  CompleteGenerationInput,
  CompleteGenerationResult,
  CompleteAssetThumbnailInput,
  CostMarginRow,
  CreateGenerationInput,
  CreateGenerationResult,
  CreateGenerationShareInput,
  CreateUserAssetInput,
  FailGenerationInput,
  FailAssetThumbnailInput,
  FinishProviderRequestInput,
  GalleryDetail,
  GenerationArtifact,
  GenerationCallStats,
  GenerationEvent,
  GenerationInputAsset,
  GenerationRecord,
  GenerationRepository,
  GenerationShare,
  GetOwnedStorageObjectInput,
  GetGenerationShareForRecordInput,
  ListAdminGalleryResult,
  ListAdminTasksResult,
  ListFeedbackResult,
  ListGalleryResult,
  ListGenerationArtifactsOptions,
  ListGenerationArtifactsResult,
  ListGenerationRecordsOptions,
  ListGenerationRecordsResult,
  ListNotificationsResult,
  ListPromptLibraryResult,
  ListUnifiedAssetsOptions,
  ListUnifiedAssetsResult,
  MarkArtifactFailedInput,
  MarkArtifactStoredInput,
  ModelCost,
  PromptLibraryItem,
  RetentionAnalytics,
  UserFeedback,
  MarkAssetThumbnailProcessingInput,
  MarkGenerationProcessingInput,
  PublicSharedGeneration,
  OwnedStorageObject,
  ProviderRequestAudit,
  WorkerHeartbeat,
  RequestGenerationCancelInput,
  RenewTaskLockInput,
  RetryGenerationInput,
  RevokeGenerationShareInput,
  RecordAuditEventInput,
  SaveTaskOptions,
  ScheduleGenerationPollInput,
  SetGenerationLibraryStateInput,
  StartProviderRequestInput,
  ListStuckGenerationRecordsInput,
  UpdateGenerationRecordPatch,
  UnifiedAssetItem,
} from '@bailian-studio/generation-repository'
import { getModelById, type FrozenModelManifest } from '@bailian-studio/model-core'
import type { NormalizedOutput } from '@bailian-studio/provider-dashscope'
import type { Logger } from '@bailian-studio/shared'
import type { StorageAdapter, StorageReadInput, StorageReadUrlInput, StorageReadResult, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type {
  ProviderCancelInput,
  ProviderCancelOutput,
  ProviderExecuteInput,
  ProviderExecuteOutput,
  ProviderRunner,
} from '../src/providers'

export const qwenImage: FrozenModelManifest = (() => {
  const manifest = getModelById('qwen-image')
  if (manifest === undefined) throw new Error('qwen-image manifest missing from registry — test setup failed')
  return manifest
})()

export const NOW = '2026-06-28T00:00:00.000Z'

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown>
}

export type RecordingLogger = Logger & { entries: LogEntry[] }

/** 一个把每次调用都记录进 `entries`、而不是写入 stderr 的 Logger。 */
export function createRecordingLogger(): RecordingLogger {
  const entries: LogEntry[] = []
  return {
    info: (message, meta) => { entries.push({ level: 'info', message, ...(meta !== undefined ? { meta } : {}) }) },
    warn: (message, meta) => { entries.push({ level: 'warn', message, ...(meta !== undefined ? { meta } : {}) }) },
    error: (message, meta) => { entries.push({ level: 'error', message, ...(meta !== undefined ? { meta } : {}) }) },
    entries,
  }
}

export type RepoMutation =
  | { kind: 'complete'; input: CompleteGenerationInput }
  | { kind: 'schedulePoll'; input: ScheduleGenerationPollInput }
  | { kind: 'fail'; input: FailGenerationInput }
  | { kind: 'cancelGeneration'; input: CancelGenerationInput }
  | { kind: 'markArtifactStored'; input: MarkArtifactStoredInput }
  | { kind: 'markArtifactFailed'; input: MarkArtifactFailedInput }
  | { kind: 'markAssetThumbnailProcessing'; input: MarkAssetThumbnailProcessingInput }
  | { kind: 'completeAssetThumbnail'; input: CompleteAssetThumbnailInput }
  | { kind: 'failAssetThumbnail'; input: FailAssetThumbnailInput }

/** 实现 TaskExecutor 所用方法的内存版 repository。 */
export class FakeRepository implements GenerationRepository {
  readonly mutations: RepoMutation[] = []
  readonly records = new Map<string, GenerationRecord>()
  readonly artifacts = new Map<string, GenerationArtifact>()
  readonly thumbnailSources = new Map<string, AssetThumbnailSource>()
  readonly savedTasks: TaskRecord[] = []
  /** 设置后，claimNextQueuedTask 在排空队列前会先用该错误 reject 一次。 */
  claimError: Error | null = null
  readonly claimQueue: TaskRecord[] = []
  readonly renewedTaskLocks: RenewTaskLockInput[] = []
  renewTaskLockResult: TaskRecord | undefined
  renewTaskLockLost = false
  renewTaskLockError: Error | null = null
  readonly providerRequests: ProviderRequestAudit[] = []
  readonly generationInputAssets = new Map<string, GenerationInputAsset[]>()
  readonly generationInputAssetReads: string[] = []
  readonly workerHeartbeatEvents: Array<{ kind: 'register' | 'touch' | 'stop'; workerId: string }> = []
  completionBillingAnomaly: CompleteGenerationResult['billingAnomaly']
  completionOutcome: CompleteGenerationResult['outcome'] = 'completed'

  getGenerationRecord(id: string): Promise<GenerationRecord | undefined> {
    return Promise.resolve(this.records.get(id))
  }

  setGenerationLibraryState(
    _input: SetGenerationLibraryStateInput,
  ): Promise<GenerationRecord> {
    return Promise.reject(
      new Error('FakeRepository.setGenerationLibraryState is not used'),
    )
  }

  getGenerationInputAssets(recordId: string): Promise<GenerationInputAsset[]> {
    this.generationInputAssetReads.push(recordId)
    return Promise.resolve([...(this.generationInputAssets.get(recordId) ?? [])])
  }

  listStuckGenerationRecords(_input?: ListStuckGenerationRecordsInput): Promise<GenerationRecord[]> {
    return Promise.resolve([])
  }

  countGenerationCallsBetween(_since: string, _until: string): Promise<GenerationCallStats> {
    return Promise.resolve({ total: 0, byModel: [], byHour: [] })
  }

  startProviderRequest(input: StartProviderRequestInput): Promise<ProviderRequestAudit> {
    const startedAt = input.startedAt ?? NOW
    const audit: ProviderRequestAudit = {
      id: `provider_req_${this.providerRequests.length + 1}`,
      generationId: input.generationId,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      userId: input.userId,
      provider: input.provider,
      providerModel: input.providerModel,
      operation: input.operation,
      status: 'started',
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
      attempt: input.attempt,
      estimatedCostCents: input.estimatedCostCents,
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    }
    this.providerRequests.push(audit)
    return Promise.resolve(audit)
  }

  finishProviderRequest(input: FinishProviderRequestInput): Promise<ProviderRequestAudit | undefined> {
    const index = this.providerRequests.findIndex(audit => audit.id === input.auditId)
    const existing = this.providerRequests[index]
    if (existing === undefined) return Promise.resolve(undefined)

    const completedAt = input.completedAt ?? NOW
    const updated: ProviderRequestAudit = {
      ...existing,
      status: input.status,
      ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
      ...(input.providerRequestId !== undefined ? { providerRequestId: input.providerRequestId } : {}),
      ...(input.billedCostCents !== undefined ? { billedCostCents: input.billedCostCents } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      completedAt,
      latencyMs: input.latencyMs,
      updatedAt: completedAt,
    }
    this.providerRequests[index] = updated
    return Promise.resolve(updated)
  }

  recordAuditEvent(_input: RecordAuditEventInput): Promise<AuditLog> {
    return Promise.reject(new Error('FakeRepository.recordAuditEvent is not used'))
  }

  registerWorkerHeartbeat(input: { workerId: string; startedAt: string; now?: string }): Promise<WorkerHeartbeat> {
    const now = input.now ?? NOW
    this.workerHeartbeatEvents.push({ kind: 'register', workerId: input.workerId })
    return Promise.resolve({
      workerId: input.workerId,
      status: 'running',
      startedAt: input.startedAt,
      lastSeenAt: now,
      updatedAt: now,
    })
  }

  touchWorkerHeartbeat(workerId: string, now = NOW): Promise<WorkerHeartbeat> {
    this.workerHeartbeatEvents.push({ kind: 'touch', workerId })
    return Promise.resolve({
      workerId,
      status: 'running',
      startedAt: NOW,
      lastSeenAt: now,
      updatedAt: now,
    })
  }

  stopWorkerHeartbeat(workerId: string, now = NOW): Promise<WorkerHeartbeat> {
    this.workerHeartbeatEvents.push({ kind: 'stop', workerId })
    return Promise.resolve({
      workerId,
      status: 'stopping',
      startedAt: NOW,
      lastSeenAt: now,
      stoppedAt: now,
      updatedAt: now,
    })
  }

  completeGeneration(input: CompleteGenerationInput): Promise<CompleteGenerationResult> {
    this.mutations.push({ kind: 'complete', input })
    return Promise.resolve({
      outcome: this.completionOutcome,
      record: this.snapshot(input.recordId),
      ...(this.completionBillingAnomaly !== undefined ? { billingAnomaly: this.completionBillingAnomaly } : {}),
    })
  }

  scheduleGenerationPoll(input: ScheduleGenerationPollInput): Promise<{ record: GenerationRecord; task: TaskRecord }> {
    this.mutations.push({ kind: 'schedulePoll', input })
    return Promise.resolve({
      record: this.snapshot(input.recordId),
      task: makeTask({ recordId: input.recordId, type: 'generation.poll' }),
    })
  }

  failGeneration(input: FailGenerationInput): Promise<GenerationRecord> {
    this.mutations.push({ kind: 'fail', input })
    return Promise.resolve(this.snapshot(input.recordId))
  }

  cancelGeneration(input: CancelGenerationInput): Promise<GenerationRecord> {
    // 与真实仓库一致：只写 cancelled（绝不写 failed），并保留 errorJson 字段，
    // 让测试能断言「取消短路走了 cancelGeneration 而非 failGeneration」。
    this.mutations.push({ kind: 'cancelGeneration', input })
    const existing = this.records.get(input.recordId)
    const updated: GenerationRecord = {
      ...(existing ?? makeRecord({ id: input.recordId })),
      status: 'cancelled',
      statusReason: input.error.message,
      errorJson: {
        category: input.error.category,
        message: input.error.message,
        retriable: input.error.retriable,
        ...(input.error.code !== undefined ? { code: input.error.code } : {}),
      },
      updatedAt: input.now ?? NOW,
    }
    this.records.set(input.recordId, updated)
    return Promise.resolve(updated)
  }

  listArtifactsForRecord(recordId: string): Promise<GenerationArtifact[]> {
    return Promise.resolve([...this.artifacts.values()].filter(artifact => artifact.recordId === recordId))
  }

  listArtifactsForRecords(recordIds: readonly string[]): Promise<GenerationArtifact[]> {
    const requested = new Set(recordIds)
    return Promise.resolve(
      [...this.artifacts.values()].filter(artifact => requested.has(artifact.recordId)),
    )
  }

  listPendingArtifactsForRecord(recordId: string): Promise<GenerationArtifact[]> {
    return Promise.resolve(
      [...this.artifacts.values()].filter(artifact => artifact.recordId === recordId && artifact.status === 'pending'),
    )
  }

  markArtifactStored(input: MarkArtifactStoredInput): Promise<GenerationArtifact> {
    this.mutations.push({ kind: 'markArtifactStored', input })
    const existing = this.artifacts.get(input.artifactId)
    if (existing === undefined) throw new Error(`artifact not found: ${input.artifactId}`)
    const updated: GenerationArtifact = {
      ...existing,
      status: 'stored',
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      byteSize: input.byteSize,
      updatedAt: input.now ?? NOW,
      ...(input.storageUrl !== undefined ? { storageUrl: input.storageUrl } : {}),
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
    }
    this.artifacts.set(input.artifactId, updated)
    return Promise.resolve(updated)
  }

  markArtifactFailed(input: MarkArtifactFailedInput): Promise<GenerationArtifact> {
    this.mutations.push({ kind: 'markArtifactFailed', input })
    const existing = this.artifacts.get(input.artifactId)
    if (existing === undefined) throw new Error(`artifact not found: ${input.artifactId}`)
    const updated: GenerationArtifact = {
      ...existing,
      status: 'failed',
      errorJson: {
        category: input.error.category,
        message: input.error.message,
        retriable: input.error.retriable,
        ...(input.error.code !== undefined ? { code: input.error.code } : {}),
      },
      updatedAt: input.now ?? NOW,
    }
    this.artifacts.set(input.artifactId, updated)
    return Promise.resolve(updated)
  }

  getAssetThumbnailSource(derivativeId: string): Promise<AssetThumbnailSource | undefined> {
    return Promise.resolve(this.thumbnailSources.get(derivativeId))
  }

  markAssetThumbnailProcessing(input: MarkAssetThumbnailProcessingInput): Promise<boolean> {
    this.mutations.push({ kind: 'markAssetThumbnailProcessing', input })
    const current = this.thumbnailSources.get(input.derivativeId)
    if (current === undefined) return Promise.resolve(false)
    this.thumbnailSources.set(input.derivativeId, { ...current, status: 'processing' })
    return Promise.resolve(true)
  }

  completeAssetThumbnail(input: CompleteAssetThumbnailInput): Promise<void> {
    this.mutations.push({ kind: 'completeAssetThumbnail', input })
    const current = this.thumbnailSources.get(input.derivativeId)
    if (current !== undefined) this.thumbnailSources.set(input.derivativeId, { ...current, status: 'ready' })
    return Promise.resolve()
  }

  failAssetThumbnail(input: FailAssetThumbnailInput): Promise<void> {
    this.mutations.push({ kind: 'failAssetThumbnail', input })
    const current = this.thumbnailSources.get(input.derivativeId)
    if (current !== undefined) {
      this.thumbnailSources.set(input.derivativeId, {
        ...current,
        status: input.retrying === true ? 'queued' : 'failed',
      })
    }
    return Promise.resolve()
  }

  claimNextQueuedTask(): Promise<TaskRecord | undefined> {
    if (this.claimError !== null) {
      const error = this.claimError
      this.claimError = null
      return Promise.reject(error)
    }
    return Promise.resolve(this.claimQueue.shift())
  }

  renewTaskLock(input: RenewTaskLockInput): Promise<TaskRecord | undefined> {
    this.renewedTaskLocks.push(input)
    if (this.renewTaskLockError !== null) return Promise.reject(this.renewTaskLockError)
    if (this.renewTaskLockLost) return Promise.resolve(undefined)
    return Promise.resolve(this.renewTaskLockResult ?? makeTask({
      id: input.taskId,
      status: 'running',
      lockedBy: input.workerId,
      lockedUntil: input.lockedUntil,
    }))
  }

  private snapshot(recordId: string): GenerationRecord {
    const existing = this.records.get(recordId)
    return existing ?? makeRecord({ id: recordId })
  }

  // TaskExecutor / WorkerLoop 不会调用到的方法。
  createGeneration(_input: CreateGenerationInput): Promise<CreateGenerationResult> {
    return Promise.reject(new Error('FakeRepository.createGeneration is not used'))
  }
  listGenerationRecords(_userId: string, _options?: ListGenerationRecordsOptions): Promise<ListGenerationRecordsResult> {
    return Promise.resolve({ items: [] })
  }
  updateGenerationRecord(_id: string, _patch: UpdateGenerationRecordPatch): Promise<GenerationRecord> {
    return Promise.reject(new Error('FakeRepository.updateGenerationRecord is not used'))
  }
  markGenerationProcessing(_input: MarkGenerationProcessingInput): Promise<GenerationRecord> {
    return Promise.reject(new Error('FakeRepository.markGenerationProcessing is not used'))
  }
  // Library / cancel / retry 方法不被 TaskExecutor / WorkerLoop 调用；这里 stub
  // 仅为满足 GenerationRepository 接口契约。
  listArtifactsForUser(_userId: string, _options?: ListGenerationArtifactsOptions): Promise<ListGenerationArtifactsResult> {
    return Promise.resolve({ items: [] })
  }
  requestGenerationCancel(_input: RequestGenerationCancelInput): Promise<GenerationRecord> {
    return Promise.reject(new Error('FakeRepository.requestGenerationCancel is not used'))
  }
  retryGeneration(_input: RetryGenerationInput): Promise<CreateGenerationResult> {
    return Promise.reject(new Error('FakeRepository.retryGeneration is not used'))
  }
  saveTask(task: TaskRecord, _options?: SaveTaskOptions): Promise<TaskRecord> {
    this.savedTasks.push(task)
    return Promise.resolve(task)
  }
  getTask(_id: string): Promise<TaskRecord | undefined> {
    return Promise.reject(new Error('FakeRepository.getTask is not used'))
  }
  listGenerationEvents(): Promise<GenerationEvent[]> {
    return Promise.resolve([])
  }
  getGenerationEvent(_id: string, _userId?: string): Promise<GenerationEvent | undefined> {
    return Promise.resolve(undefined)
  }
  getLatestGenerationEvent(): Promise<GenerationEvent | undefined> {
    return Promise.resolve(undefined)
  }

  // Share 相关方法不被 TaskExecutor / WorkerLoop 调用；仅为满足
  // GenerationRepository 接口契约而 stub。
  createGenerationShare(_input: CreateGenerationShareInput): Promise<GenerationShare> {
    return Promise.reject(new Error('FakeRepository.createGenerationShare is not used'))
  }
  getGenerationShareForRecord(_input: GetGenerationShareForRecordInput): Promise<GenerationShare | undefined> {
    return Promise.resolve(undefined)
  }
  getPublicSharedGeneration(_shareId: string): Promise<PublicSharedGeneration | undefined> {
    return Promise.resolve(undefined)
  }
  getPublicSharedArtifact(_shareId: string, _artifactId: string): Promise<GenerationArtifact | undefined> {
    return Promise.resolve(undefined)
  }
  getOwnedStorageObject(_input: GetOwnedStorageObjectInput): Promise<OwnedStorageObject | undefined> {
    return Promise.resolve(undefined)
  }
  revokeGenerationShare(_input: RevokeGenerationShareInput): Promise<GenerationShare | undefined> {
    return Promise.resolve(undefined)
  }
  // Unified-asset 相关方法不被 TaskExecutor / WorkerLoop 调用；仅为满足
  // GenerationRepository 接口契约而 stub。
  createUserAsset(_input: CreateUserAssetInput): Promise<void> {
    return Promise.resolve()
  }
  listUnifiedAssets(_userId: string, _options?: ListUnifiedAssetsOptions): Promise<ListUnifiedAssetsResult> {
    return Promise.resolve({ items: [] })
  }
  getUserAsset(_input: {
    userId: string
    assetId: string
    includeDeleted?: boolean
  }): Promise<UnifiedAssetItem | undefined> {
    return Promise.resolve(undefined)
  }
  softDeleteUserAsset(_input: {
    userId: string
    assetId: string
    now?: string
  }): Promise<boolean> {
    return Promise.resolve(false)
  }
  // ---- 社区/内容域方法：worker 不使用，按需返回占位值以满足接口。 ----
  setGenerationVisibility(): Promise<GenerationRecord> {
    throw new Error('FakeRepository.setGenerationVisibility is not used')
  }
  listGalleryGenerations(): Promise<ListGalleryResult> {
    return Promise.resolve({ items: [] })
  }
  getGalleryGeneration(): Promise<GalleryDetail | undefined> {
    return Promise.resolve(undefined)
  }
  getGalleryArtifact(): Promise<GenerationArtifact | undefined> {
    return Promise.resolve(undefined)
  }
  setGenerationLike(): Promise<{ liked: boolean; likeCount: number }> {
    return Promise.resolve({ liked: false, likeCount: 0 })
  }
  setGenerationFavorite(): Promise<{ favorited: boolean }> {
    return Promise.resolve({ favorited: false })
  }
  getGenerationFavorited(): Promise<boolean | undefined> {
    return Promise.resolve(undefined)
  }
  listGenerationFavorites(): Promise<ListGalleryResult> {
    return Promise.resolve({ items: [] })
  }
  listPromptLibrary(): Promise<ListPromptLibraryResult> {
    return Promise.resolve({ items: [] })
  }
  createPromptLibraryItem(): Promise<PromptLibraryItem> {
    throw new Error('FakeRepository.createPromptLibraryItem is not used')
  }
  updatePromptLibraryItem(): Promise<PromptLibraryItem> {
    throw new Error('FakeRepository.updatePromptLibraryItem is not used')
  }
  deletePromptLibraryItem(): Promise<void> {
    return Promise.resolve()
  }
  listModelCosts(): Promise<ModelCost[]> {
    return Promise.resolve([])
  }
  upsertModelCosts(): Promise<void> {
    return Promise.resolve()
  }
  getCostMarginAnalytics(): Promise<CostMarginRow[]> {
    return Promise.resolve([])
  }
  getRetentionAnalytics(): Promise<RetentionAnalytics> {
    return Promise.resolve({ firstGeneration: 0, firstSuccess: 0, activeTwoDays: 0 })
  }
  submitFeedback(): Promise<UserFeedback> {
    throw new Error('FakeRepository.submitFeedback is not used')
  }
  listFeedback(): Promise<ListFeedbackResult> {
    return Promise.resolve({ items: [] })
  }
  updateFeedbackStatus(): Promise<UserFeedback> {
    throw new Error('FakeRepository.updateFeedbackStatus is not used')
  }
  listMyFeedback(): Promise<ListFeedbackResult> {
    return Promise.resolve({ items: [] })
  }
  // ---- 社区治理（admin）+ 社交通知方法：worker 不使用，按需返回占位值以满足接口。 ----
  listAdminGalleryGenerations(): Promise<ListAdminGalleryResult> {
    return Promise.resolve({ items: [] })
  }
  getAdminGalleryArtifact(): Promise<GenerationArtifact | undefined> {
    return Promise.resolve(undefined)
  }
  listAdminGalleryRecordArtifacts(input: { recordId: string }): Promise<GenerationArtifact[]> {
    return Promise.resolve(
      [...this.artifacts.values()].filter(artifact => artifact.recordId === input.recordId),
    )
  }
  setGalleryRecordHidden(): Promise<void> {
    return Promise.resolve()
  }
  setGalleryRecordsHidden(): Promise<string[]> {
    return Promise.resolve([])
  }
  softDeleteGalleryRecords(): Promise<string[]> {
    return Promise.resolve([])
  }
  hideUserPublicWorks(): Promise<number> {
    return Promise.resolve(0)
  }
  listAdminTasks(): Promise<ListAdminTasksResult> {
    return Promise.resolve({ items: [] })
  }
  getGenerationOwner(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }
  createSocialNotification(): Promise<void> {
    return Promise.resolve()
  }
  listNotifications(): Promise<ListNotificationsResult> {
    return Promise.resolve({ items: [] })
  }
  countUnreadNotifications(): Promise<number> {
    return Promise.resolve(0)
  }
  markNotificationRead(): Promise<boolean> {
    return Promise.resolve(false)
  }
  markAllNotificationsRead(): Promise<number> {
    return Promise.resolve(0)
  }
}

/** 按顺序返回队列中输出的 ProviderRunner，被武装（设置 throwError）时抛错。 */
export class FakeProviderRunner implements ProviderRunner {
  readonly providerId = 'fake'
  readonly inputs: ProviderExecuteInput[] = []
  readonly cancelInputs: ProviderCancelInput[] = []
  readonly outputs: ProviderExecuteOutput[] = []
  cancelOutput: ProviderCancelOutput = {
    status: 'unsupported',
    reason: 'fake runner default',
  }
  throwError: Error | null = null

  supports(_manifest: FrozenModelManifest): boolean {
    return true
  }

  async execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    this.inputs.push(input)
    if (this.throwError !== null) throw this.throwError
    const next = this.outputs.shift()
    if (next === undefined) throw new Error('FakeProviderRunner has no queued output')
    return next
  }

  async cancel(input: ProviderCancelInput): Promise<ProviderCancelOutput> {
    this.cancelInputs.push(input)
    return this.cancelOutput
  }
}

export class FakeStorageAdapter implements StorageAdapter {
  readonly provider = 'local'
  readonly keyPrefix = ''
  readonly writes: StorageWriteInput[] = []
  readonly deletes: string[] = []
  readonly readUrls: StorageReadUrlInput[] = []
  readUrlFactory: (input: StorageReadUrlInput) => string = input => `file://${input.key}?expires=${input.expiresInSeconds}`
  throwError: Error | null = null

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    this.writes.push(input)
    if (this.throwError !== null) throw this.throwError
    return {
      provider: this.provider,
      key: input.key,
      byteSize: input.body.byteLength,
      url: `file://${input.key}`,
    }
  }

  async readObject(_input: StorageReadInput): Promise<StorageReadResult> {
    return { body: new Uint8Array([1, 2, 3]), contentType: 'video/mp4' }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    this.deletes.push(input.key)
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    this.readUrls.push(input)
    return Promise.resolve(this.readUrlFactory(input))
  }
}

export function makeRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const base: GenerationRecord = {
    id: 'rec_1',
    userId: 'user_1',
    modelId: 'qwen-image',
    provider: 'dashscope',
    providerModel: 'qwen-image',
    category: 'image',
    inputParams: { prompt: 'lantern', n: 1, size: '1024*1024' },
    visibility: 'private',
    status: 'processing',
    costEstimate: 20,
    currency: 'CNY',
    pricingVersion: 'pricing-test',
    modelManifestHash: 'manifest-test',
    providerCancelStatus: 'not_requested',
    createdAt: NOW,
    updatedAt: NOW,
  }
  return { ...base, ...overrides }
}

export function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const base: TaskRecord = {
    id: 'task_1',
    type: 'generation.submit',
    domain: 'generation',
    status: 'running',
    priority: 0,
    input: { recordId: 'rec_1' },
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: NOW,
    recordId: 'rec_1',
    userId: 'user_1',
    createdAt: NOW,
    updatedAt: NOW,
  }
  return { ...base, ...overrides }
}

export function makeArtifact(overrides: Partial<GenerationArtifact> = {}): GenerationArtifact {
  const base: GenerationArtifact = {
    id: 'artifact_1',
    recordId: 'rec_1',
    userId: 'user_1',
    kind: 'text',
    text: 'hello',
    mimeType: 'text/plain; charset=utf-8',
    status: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
  }
  return { ...base, ...overrides }
}

export function makeImageOutput(): NormalizedOutput {
  return { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn/bailian-studio/img.png' }], raw: { ok: true } }
}

export function failedCodes(mutations: RepoMutation[]): string[] {
  return mutations
    .filter((m): m is { kind: 'fail'; input: FailGenerationInput } => m.kind === 'fail')
    .map(m => m.input.error.code ?? '__no_code__')
}

/** 提取所有 cancelGeneration mutation 的 error code，用于断言取消短路走了取消而非失败。 */
export function cancelledCodes(mutations: RepoMutation[]): string[] {
  return mutations
    .filter((m): m is { kind: 'cancelGeneration'; input: CancelGenerationInput } => m.kind === 'cancelGeneration')
    .map(m => m.input.error.code ?? '__no_code__')
}
