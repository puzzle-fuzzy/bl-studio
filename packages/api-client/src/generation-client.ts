/**
 * Bailian Studio API 的类型化客户端。
 *
 * 每个方法的返回值都是经过 schema 校验后推断出的类型 —— 传输层（unwrapData）
 * 是唯一会接触 `unknown` 的地方，所以调用方永远不需要写 `as` 强转。
 *
 * 鉴权基于 cookie：每个请求都带 `credentials: 'include'`，这样 http-only 的
 * 会话 cookie 才能跟随请求到达 API；userId 由服务端从会话中解析得到，客户端
 * 【不存在】userId 这个概念（也正因如此，客户端无法伪造他人的 userId）。
 */
import { z } from 'zod'
import { ApiClientError, requestNoContent, unwrapData } from './http'
import {
  AdminListUsersResponseSchema,
  AdminStatsOverviewSchema,
  AdminUserDetailResponseSchema,
  AdminUserResponseSchema,
  AssetCapabilitiesSchema,
  BatchAffectedResponseSchema,
  BatchGrantPointsResponseSchema,
  AssetItemSchema,
  AssetResponseSchema,
  ApiErrorSchema,
  AuthResponseSchema,
  CancelGenerationResponseSchema,
  CreditBalanceResponseSchema,
  CreateGenerationResponseSchema,
  DirectorProjectListResponseSchema,
  DirectorProjectResponseSchema,
  EmailActionAcceptedSchema,
  GenerationRecordUpdateResponseSchema,
  GenerationEstimateResponseSchema,
  GenerationDiagnosticsSchema,
  CreateMediaJobResponseSchema,
  GenerationRecordSchema,
  GenerationShareResponseSchema,
  AdminAnalyticsSchema,
  AdminModelCostsResponseSchema,
  AdminModelCostsUpdateResponseSchema,
  AdminGalleryHideResultSchema,
  FeedbackItemResponseSchema,
  ContentReportItemResponseSchema,
  ListContentReportsResponseSchema,
  AdminGalleryArtifactsResponseSchema,
  ListAdminGalleryResponseSchema,
  ListAdminTasksResponseSchema,
  ListFeedbackResponseSchema,
  ListNotificationsResponseSchema,
  NotificationReadAllSchema,
  NotificationReadSchema,
  NotificationUnreadCountSchema,
  FavoriteMutationResponseSchema,
  GalleryDetailSchema,
  ListPromptLibraryResponseSchema,
  PromptLibraryItemResponseSchema,
  LikeMutationResponseSchema,
  ListArtifactsResponseSchema,
  ListGalleryResponseSchema,
  SetVisibilityResponseSchema,
  ListAssetsResponseSchema,
  ListGenerationArtifactsResponseSchema,
  ListGenerationsResponseSchema,
  ListPointsLedgerResponseSchema,
  MediaJobResponseSchema,
  ModelCatalogItemSchema,
  ModelCatalogResponseSchema,
  PointsMutationResponseSchema,
  PublicSharedGenerationResponseSchema,
  RegistrationResponseSchema,
  RetryGenerationResponseSchema,
  UsageSummaryResponseSchema,
} from './schemas'
import type {
  AdminCreateUserInput,
  AdminListUsersResult,
  AdminStatsOverview,
  AdminUpdateUserInput,
  AdminUser,
  AdminUserDetail,
  AdjustPointsInput,
  BatchAffectedResult,
  BatchGrantPointsRequest,
  BatchGrantPointsResult,
  BatchGalleryRequest,
  BatchUsersRequest,
  AdminAnalytics,
  ContentReport,
  ListContentReportsResult,
  AdminGalleryHideResult,
  AdminGalleryArtifactsResult,
  AdminModelCostsResult,
  ListAdminGalleryResult,
  ListAdminTasksResult,
  ListFeedbackResult,
  ListNotificationsResult,
  NotificationUnreadCount,
  SubmitFeedbackInput,
  UpdateFeedbackStatusInput,
  SubmitContentReportInput,
  UpdateContentReportInput,
  UserFeedback,
  CreatePromptLibraryInput,
  ListPromptLibraryResult,
  PromptLibraryItem,
  UpdatePromptLibraryInput,
  AssetCapabilities,
  AssetItem,
  CancelGenerationResult,
  CreditBalance,
  CreateGenerationResponse,
  CreateDirectorProjectInput,
  DirectorProjectDetail,
  DirectorProjectListResult,
  EmailActionAccepted,
  GenerationEstimate,
  GenerationDiagnostics,
  CreateMediaJobResult,
  GenerationRecord,
  GenerationShareResult,
  FavoriteMutationResult,
  GalleryDetail,
  GrantPointsInput,
  LikeMutationResult,
  ListArtifactsResult,
  ListGalleryResult,
  SetVisibilityInput,
  ListAssetsResult,
  ListGenerationArtifactsResult,
  ListGenerationsResult,
  ListPointsLedgerResult,
  MediaJob,
  ModelCatalogItem,
  PointsMutationResult,
  PublicSharedGeneration,
  PublicUser,
  RegistrationResult,
  RetryGenerationResult,
  UsageSummary,
  UpdateDirectorProjectInput,
} from './schemas'

/** 带 JSON content-type 的请求头常量，供带 body 的 POST 复用。 */
const JSON_HEADERS = { 'content-type': 'application/json' }

function uploadAssetWithProgress(
  url: string,
  formData: FormData,
  input: UploadAssetInput,
): Promise<AssetItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const cleanup = () => input.signal?.removeEventListener('abort', abort)

    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) input.onProgress?.(event.loaded, event.total)
    })
    xhr.addEventListener('error', () => {
      cleanup()
      reject(new ApiClientError('NETWORK_ERROR', 'Asset upload failed'))
    })
    xhr.addEventListener('abort', () => {
      cleanup()
      reject(new ApiClientError('REQUEST_ABORTED', 'Asset upload was cancelled'))
    })
    xhr.addEventListener('load', () => {
      cleanup()
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        reject(new ApiClientError('BAD_RESPONSE', 'Response was not valid JSON', xhr.status))
        return
      }

      const error = ApiErrorSchema.safeParse(body)
      if (error.success) {
        reject(new ApiClientError(
          error.data.error.code,
          error.data.error.message,
          xhr.status,
          error.data.error.details,
          error.data.traceId,
        ))
        return
      }

      const success = z.object({
        success: z.literal(true),
        data: AssetResponseSchema,
      }).safeParse(body)
      if (!success.success) {
        reject(new ApiClientError(
          'BAD_RESPONSE',
          'Response did not match the expected success envelope',
          xhr.status,
        ))
        return
      }
      resolve(success.data.data.asset)
    })

    input.signal?.addEventListener('abort', abort, { once: true })
    if (input.signal?.aborted === true) {
      abort()
      return
    }
    xhr.send(formData)
  })
}

export interface CreateApiClientOptions {
  baseUrl: string
  /**
   * 可注入的 fetch 实现，默认用全局 fetch。仅供测试时桩接网络使用；
   * 生产环境始终走浏览器原生 fetch，从而携带 http-only 会话 cookie。
   */
  fetch?: typeof fetch
}

/** `POST /api/generations` 的请求体；idempotencyKey 可选，用于幂等重试。 */
export interface CreateGenerationRequest {
  modelId: string
  params: Record<string, unknown>
  assetRefs?: Record<string, string | string[]>
  idempotencyKey?: string
  /** 对比批次 ID：同一次"同提示词多模型对比"的多条提交共用。 */
  batchId?: string
}

export interface UploadAssetInput {
  file: File
  kind?: string
  signal?: AbortSignal
  onProgress?: (loaded: number, total: number) => void
}

export interface CreateMediaJobRequest {
  operation: 'video.extract_audio'
  source: {
    assetId: string
    kind: 'video'
    fileName?: string
  }
  options?: {
    format?: 'mp3' | 'wav'
  }
}

/** `GET /api/generations` 的查询参数；都是可选的，未传即用服务端默认值。 */
export interface ListGenerationsParams {
  limit?: number
  cursor?: string
  status?: string
  views?: readonly GenerationListView[]
}

export type AssetSort = 'time' | 'title' | 'size'

export interface ListAssetsParams {
  limit?: number
  cursor?: string
  kind?: string
  source?: string
  sort?: AssetSort
  q?: string
}

export type GenerationListView = 'completed' | 'active' | 'hidden' | 'deleted'
export type GenerationLibraryState = 'visible' | 'hidden' | 'deleted'

/** 邮箱 + 密码的登录凭据输入。 */
export interface CredentialsInput {
  email: string
  password: string
}

/** 注册输入，在凭据基础上可选地携带 displayName。 */
export interface RegisterInput extends CredentialsInput {
  displayName?: string
}

/**
 * Bailian Studio API 客户端契约。
 *
 * 每个方法对应后端一条 HTTP 路由：方法注释里给出了路由、HTTP method、请求体/
 * 查询参数形状以及响应 schema。所有需要登录的方法都用 `credentials: 'include'`
 * 把会话 cookie 带上；未登录调用会被服务端以 401 拒绝，并在传输层映射为
 * `ApiClientError`。返回值都经过 schema 校验，类型由 schema 推断。
 */
export interface BailianStudioApiClient {
  /** `GET /api/models/catalog` —— 列出所有可用模型（返回数组形式）。 */
  getModels(): Promise<ModelCatalogItem[]>
  /** `GET /api/models/:id` —— 获取单个模型的 manifest 摘要。 */
  getModel(id: string): Promise<ModelCatalogItem>
  /** `GET /api/usage` —— 当前用户本月的生成量和成本聚合。 */
  getUsage(): Promise<UsageSummary>
  /** `GET /api/account/points` — 获取当前用户的可用、冻结和总积分。 */
  getCreditBalance(): Promise<CreditBalance>
  /** `GET /api/director/projects` — 当前用户的导演台项目列表。 */
  listDirectorProjects(params?: { limit?: number; cursor?: string }): Promise<DirectorProjectListResult>
  /** `POST /api/director/projects` — 创建一个手动短剧制作项目。 */
  createDirectorProject(input: CreateDirectorProjectInput): Promise<DirectorProjectDetail>
  /** `GET /api/director/projects/:id` — 获取项目及阶段状态。 */
  getDirectorProject(id: string): Promise<DirectorProjectDetail>
  /** `PATCH /api/director/projects/:id` — 编辑项目基础输入。 */
  updateDirectorProject(id: string, input: UpdateDirectorProjectInput): Promise<DirectorProjectDetail>
  /** `GET /api/generations/:id` —— 获取一条生成记录（含状态、输出、错误等）。 */
  getGeneration(id: string): Promise<GenerationRecord>
  /** `GET /api/generations/:id/diagnostics` —— 当前用户可见的安全链路诊断。 */
  getGenerationDiagnostics(id: string): Promise<GenerationDiagnostics>
  /** `POST /api/generations/estimate` —— 在创建前校验参数并返回价格/限额预估。 */
  estimateGeneration(input: CreateGenerationRequest): Promise<GenerationEstimate>
  /** `GET /api/generations/:id/artifacts` —— 列出某条生成记录下的全部 artifact。 */
  listGenerationArtifacts(id: string): Promise<ListGenerationArtifactsResult>
  /**
   * `GET /api/artifacts` —— 「我的作品库」：按当前用户列出 artifact（keyset 分页，
   * 可选 kind 过滤）。返回的每个 artifact 在已落存时附带 readUrl。
   */
  listArtifacts(params?: { limit?: number; cursor?: string; kind?: string }): Promise<ListArtifactsResult>
  /** `POST /api/generations` —— 创建生成任务，返回新建的 record + task + 初始事件。 */
  createGeneration(input: CreateGenerationRequest): Promise<CreateGenerationResponse>
  /**
   * `POST /api/generations/:id/cancel` —— 请求取消一条 queued/processing 的生成
   * （仅翻 cancel 标志位，不在 provider 侧真正取消）。终态记录返回 409。
   */
  cancelGeneration(id: string): Promise<CancelGenerationResult>
  /**
   * `POST /api/generations/:id/retry` —— 重跑一条 failed/cancelled 的生成，起一条
   * 新记录并指回原记录。可选 idempotencyKey 用于幂等重放。
   */
  retryGeneration(id: string, input?: { idempotencyKey?: string }): Promise<RetryGenerationResult>
  /**
   * `PATCH /api/generations/:id/library-state` —— 仅改变 owner 任务列表中的
   * 展示状态；不会取消执行、删除产物或改变计费。
   */
  setGenerationLibraryState(id: string, state: GenerationLibraryState): Promise<GenerationRecord>
  /** `POST /api/generations/:id/share` —— 创建/更新分享策略（每个 record 一个活跃 share）。 */
  createGenerationShare(id: string, input?: { includeParams?: boolean; expiresAt?: string }): Promise<GenerationShareResult>
  /** `GET /api/generations/:id/share` —— 获取【所有者】视角下的 share 信息。 */
  getGenerationShare(id: string): Promise<GenerationShareResult>
  /** `DELETE /api/generations/:id/share` —— 撤销当前公开分享。 */
  revokeGenerationShare(id: string): Promise<GenerationShareResult>
  /** `GET /api/shares/generations/:shareId` —— 公开访问的匿名只读 read model（无需登录）。 */
  getSharedGeneration(shareId: string): Promise<PublicSharedGeneration>
  /** `GET /api/generations` —— keyset 分页列表，通过 cursor 翻页。 */
  listGenerations(params?: ListGenerationsParams): Promise<ListGenerationsResult>
  createMediaJob(input: CreateMediaJobRequest): Promise<CreateMediaJobResult>
  getMediaJob(id: string): Promise<MediaJob>
  /**
   * 返回当前用户 SSE 事件流的完整 URL，供浏览器 `EventSource` 直接订阅
   * （`/api/generations/events`）。EventSource 会自带 cookie，所以无需额外配置。
   */
  generationEventsUrl(): string
  /** `POST /api/auth/register` —— 注册并写入会话 cookie，返回新建的公开用户信息。 */
  register(input: RegisterInput): Promise<RegistrationResult>
  verifyEmail(input: { token: string }): Promise<PublicUser>
  resendVerification(input: { email: string }): Promise<EmailActionAccepted>
  forgotPassword(input: { email: string }): Promise<EmailActionAccepted>
  resetPassword(input: { token: string; newPassword: string }): Promise<void>
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<PublicUser>
  /** `POST /api/auth/github/unlink` —— 解绑 GitHub（必须保留邮箱密码登录）。 */
  unlinkGithub(): Promise<PublicUser>
  /** `PATCH /api/auth/profile` —— 更新当前用户昵称（displayName）。 */
  updateProfile(input: { displayName: string }): Promise<PublicUser>
  /** `POST /api/auth/avatar` —— 上传自定义头像（multipart 图片），返回更新后的用户。 */
  uploadAvatar(file: File): Promise<PublicUser>
  /** `DELETE /api/auth/avatar` —— 移除自定义头像，回到 identicon 默认头像。 */
  removeAvatar(): Promise<PublicUser>
  logoutAll(): Promise<void>
  /** `POST /api/auth/login` —— 登录并写入会话 cookie，返回当前用户。 */
  login(input: CredentialsInput): Promise<PublicUser>
  /** `POST /api/assets/upload` —— 上传文件，返回新建的资产记录。 */
  uploadAsset(input: UploadAssetInput): Promise<AssetItem>

  /** `POST /api/assets/import` —— 导入外部 URL 作为资产，返回新建的资产记录。 */
  importAsset(input: { url: string; kind: string; metadata?: Record<string, unknown> }): Promise<AssetItem>

  /** `GET /api/assets` —— 统一资产列表（合并上传+生成），支持 kind/source 筛选 + keyset 分页。 */
  listAssets(params?: ListAssetsParams): Promise<ListAssetsResult>
  getAssetCapabilities(): Promise<AssetCapabilities>
  getAsset(id: string): Promise<AssetItem>
  deleteAsset(id: string): Promise<void>

  /** `POST /api/auth/logout` —— 注销，服务端软删 session 让 cookie 失效。 */
  logout(): Promise<void>
  /**
   * `GET /api/auth/me` —— 用会话 cookie 解析当前用户。
   * 注意：未登录（401）在本方法里被【有意】映射为 `null`，而不是抛异常，
   * 这样前端可以直接用返回值做"是否登录"的判断；其它错误仍照常抛出。
   */
  getCurrentUser(): Promise<PublicUser | null>

  // ---------------------------------------------------------------------------
  // 管理后台（需 admin 角色；否则 403）
  // ---------------------------------------------------------------------------

  /** `GET /api/admin/users` —— 分页列用户，支持 q/cursor/limit 或 page/pageSize。 */
  listAdminUsers(params?: {
    q?: string
    limit?: number
    cursor?: string
    page?: number
    pageSize?: number
  }): Promise<AdminListUsersResult>
  /** `GET /api/admin/stats/overview` —— 今日调用 + 近 14 天注册统计概览。 */
  adminGetStatsOverview(): Promise<AdminStatsOverview>
  /** `POST /api/admin/users` —— 创建账户（跳过邮箱验证）。 */
  adminCreateUser(input: AdminCreateUserInput): Promise<AdminUser>
  /** `GET /api/admin/users/:userId` —— 用户详情（含积分余额）。 */
  adminGetUser(userId: string): Promise<AdminUserDetail>
  /** `PATCH /api/admin/users/:userId` —— 改昵称/角色。 */
  adminUpdateUser(userId: string, input: AdminUpdateUserInput): Promise<AdminUser>
  /** `DELETE /api/admin/users/:userId` —— 软删除用户。 */
  adminDeleteUser(userId: string): Promise<void>
  /** `POST /api/admin/users/:userId/ban` —— 封禁用户（吊销会话，禁登录/禁新生成）。 */
  adminBanUser(userId: string): Promise<void>
  /** `POST /api/admin/users/:userId/unban` —— 解除封禁。 */
  adminUnbanUser(userId: string): Promise<void>
  /** `POST /api/admin/users/batch-ban` —— 批量封禁（自动剔除当前 admin 自身）。 */
  adminBatchBanUsers(input: BatchUsersRequest): Promise<BatchAffectedResult>
  /** `POST /api/admin/users/batch-unban` —— 批量解封。 */
  adminBatchUnbanUsers(input: BatchUsersRequest): Promise<BatchAffectedResult>
  /** `POST /api/admin/users/batch-delete` —— 批量软删除（自动剔除当前 admin 自身）。 */
  adminBatchDeleteUsers(input: BatchUsersRequest): Promise<BatchAffectedResult>
  /** `POST /api/admin/users/batch-grant-points` —— 批量赠送积分（整批共享幂等键）。 */
  adminBatchGrantPoints(input: BatchGrantPointsRequest): Promise<BatchGrantPointsResult>
  /** `GET /api/admin/users/:userId/points` —— 指定用户积分余额。 */
  adminGetUserPoints(userId: string): Promise<CreditBalance>
  /** `GET /api/admin/users/:userId/points/ledger` —— 指定用户积分流水。 */
  adminListUserPointsLedger(userId: string, params?: { limit?: number; cursor?: string }): Promise<ListPointsLedgerResult>
  /** `POST /api/admin/users/:userId/points/grants` —— 赠送积分。 */
  adminGrantPoints(userId: string, input: GrantPointsInput): Promise<PointsMutationResult>
  /** `POST /api/admin/users/:userId/points/adjustments` —— 积分调整（±）。 */
  adminAdjustPoints(userId: string, input: AdjustPointsInput): Promise<PointsMutationResult>
  /** `GET /api/admin/users/:userId/assets` —— 指定用户全部资产。 */
  adminListUserAssets(userId: string, params?: ListAssetsParams): Promise<ListAssetsResult>

  // 社区画廊（需登录；公开可见性由作品 owner 决定）
  // ---------------------------------------------------------------------------
  /** `GET /api/gallery` —— 社区画廊公开作品列表（keyset + category/modelId/作者/搜索/排序）。 */
  listGallery(params?: {
    limit?: number
    cursor?: string
    category?: 'image' | 'video' | 'audio' | 'text'
    modelId?: string
    authorId?: string
    q?: string
    sort?: 'latest' | 'hot'
  }): Promise<ListGalleryResult>
  /** `GET /api/gallery/favorites` —— 我的收藏列表。 */
  listMyFavorites(params?: { limit?: number; cursor?: string }): Promise<ListGalleryResult>
  /** `GET /api/gallery/generations/:id` —— 跨用户画廊详情（脱敏）。 */
  getGalleryGeneration(recordId: string): Promise<GalleryDetail>
  /** `PATCH /api/gallery/generations/:id/visibility` —— 作品公开/私有切换（owner）。 */
  setGenerationVisibility(recordId: string, visibility: SetVisibilityInput['visibility']): Promise<{ visibility: 'private' | 'public' }>
  /** `POST /api/gallery/generations/:id/like` —— 点赞公开作品。 */
  likeGeneration(recordId: string): Promise<LikeMutationResult>
  /** `DELETE /api/gallery/generations/:id/like` —— 取消点赞。 */
  unlikeGeneration(recordId: string): Promise<LikeMutationResult>
  /** `POST /api/gallery/generations/:id/favorite` —— 收藏（本人可见作品）。 */
  favoriteGeneration(recordId: string): Promise<FavoriteMutationResult>
  /** `DELETE /api/gallery/generations/:id/favorite` —— 取消收藏。 */
  unfavoriteGeneration(recordId: string): Promise<FavoriteMutationResult>
  /** `GET /api/gallery/generations/:id/favorite` —— 查询收藏状态（本人可见作品）。 */
  getGenerationFavorite(recordId: string): Promise<{ favorited: boolean }>

  // 提示词资产库（owner 限定）
  // ---------------------------------------------------------------------------
  /** `GET /api/prompt-library` —— 我的提示词库（keyset + 名称/内容搜索）。 */
  listPromptLibrary(params?: { limit?: number; cursor?: string; q?: string }): Promise<ListPromptLibraryResult>
  /** `POST /api/prompt-library` —— 保存一条提示词（含模型与文本参数）。 */
  createPromptLibraryItem(input: CreatePromptLibraryInput): Promise<PromptLibraryItem>
  /** `PATCH /api/prompt-library/:id` —— 更新名称/提示词/参数。 */
  updatePromptLibraryItem(itemId: string, input: UpdatePromptLibraryInput): Promise<PromptLibraryItem>
  /** `DELETE /api/prompt-library/:id` —— 删除一条提示词。 */
  deletePromptLibraryItem(itemId: string): Promise<void>

  // 管理分析（需 admin）
  // ---------------------------------------------------------------------------
  /** `GET /api/admin/model-costs` —— 每模型成本单价列表。 */
  adminListModelCosts(): Promise<AdminModelCostsResult>
  /** `PUT /api/admin/model-costs` —— 批量维护成本单价。 */
  adminUpdateModelCosts(entries: Array<{ modelId: string; unitCostCents: number }>): Promise<{ updated: number }>
  /** `GET /api/admin/stats/analytics` —— 成本毛利 + 留存漏斗。 */
  adminGetAnalytics(params?: { from?: string; to?: string; days?: number }): Promise<AdminAnalytics>

  // 管理后台 · 任务中心（需 admin）
  // ---------------------------------------------------------------------------
  /** `GET /api/admin/tasks` —— 全量任务列表（含进行中 + 已完成），keyset 分页 + 过滤。 */
  adminListTasks(params?: {
    limit?: number
    cursor?: string
    status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    type?: string
    domain?: string
    userId?: string
    recordId?: string
  }): Promise<ListAdminTasksResult>

  // 管理后台 · 社区画廊治理（需 admin）
  // ---------------------------------------------------------------------------
  /** `GET /api/admin/gallery` —— 画廊治理列表（含隐藏作品，可按作者/提示词搜索）。 */
  adminListGallery(params?: {
    limit?: number
    cursor?: string
    includeHidden?: boolean
    q?: string
    authorId?: string
  }): Promise<ListAdminGalleryResult>
  /** `GET /api/admin/gallery/:id/artifacts` —— 画廊治理预览：记录的全部产物（多图切换）。 */
  adminListGalleryArtifacts(recordId: string): Promise<AdminGalleryArtifactsResult>
  /** `POST /api/admin/gallery/:id/hide` —— 下架一条公开作品。 */
  adminHideGalleryItem(recordId: string): Promise<AdminGalleryHideResult>
  /** `POST /api/admin/gallery/:id/unhide` —— 恢复一条已下架作品。 */
  adminUnhideGalleryItem(recordId: string): Promise<AdminGalleryHideResult>
  /** `POST /api/admin/gallery/batch-hide` —— 批量下架（只影响实际翻转的记录）。 */
  adminBatchHideGallery(input: BatchGalleryRequest): Promise<BatchAffectedResult>
  /** `POST /api/admin/gallery/batch-unhide` —— 批量恢复。 */
  adminBatchUnhideGallery(input: BatchGalleryRequest): Promise<BatchAffectedResult>
  /** `POST /api/admin/gallery/batch-delete` —— 批量软删（可恢复）。 */
  adminBatchDeleteGallery(input: BatchGalleryRequest): Promise<BatchAffectedResult>

  // 反馈通道
  // ---------------------------------------------------------------------------
  /** `POST /api/feedback` —— 提交意见反馈。 */
  submitFeedback(input: SubmitFeedbackInput): Promise<UserFeedback>
  /** `GET /api/feedback` —— 我的反馈历史（keyset 分页）。 */
  listMyFeedback(params?: { limit?: number; cursor?: string }): Promise<ListFeedbackResult>
  /** `GET /api/admin/feedback` —— admin 列表反馈（状态过滤）。 */
  adminListFeedback(params?: { limit?: number; cursor?: string; status?: 'open' | 'reviewing' | 'resolved' | 'closed' }): Promise<ListFeedbackResult>
  /** `PATCH /api/admin/feedback/:id` —— admin 更新反馈状态。 */
  adminUpdateFeedbackStatus(itemId: string, status: UpdateFeedbackStatusInput['status']): Promise<UserFeedback>
  /** `POST /api/reports` —— 对公开作品提交一次内容举报。 */
  submitContentReport(input: SubmitContentReportInput): Promise<ContentReport>
  /** `GET /api/admin/reports` —— 管理员查看内容举报队列。 */
  adminListContentReports(params?: {
    limit?: number
    cursor?: string
    status?: 'open' | 'reviewing' | 'resolved' | 'dismissed'
  }): Promise<ListContentReportsResult>
  /** `PATCH /api/admin/reports/:id` —— 更新审核状态，可联动下架作品。 */
  adminUpdateContentReport(reportId: string, input: UpdateContentReportInput): Promise<ContentReport>

  // 社交通知（需登录；只作用于本人）
  // ---------------------------------------------------------------------------
  /** `GET /api/notifications` —— 我的通知列表（keyset 分页）。 */
  listNotifications(params?: { limit?: number; cursor?: string }): Promise<ListNotificationsResult>
  /** `GET /api/notifications/unread-count` —— 未读数。 */
  getNotificationUnreadCount(): Promise<NotificationUnreadCount>
  /** `POST /api/notifications/:id/read` —— 标记单条已读。 */
  markNotificationRead(notificationId: string): Promise<{ read: boolean }>
  /** `POST /api/notifications/read-all` —— 全部标记已读。 */
  markAllNotificationsRead(): Promise<{ marked: number }>
}

/**
 * 创建一个 API 客户端实例。
 *
 * `baseUrl` 末尾的斜杠会被统一去掉，便于各方法直接用 `${base}/api/...` 拼接。
 * 所有方法的 `credentials: 'include'` 都是【硬编码】在调用点上的 —— 这是为了
 * 让 http-only 的会话 cookie 在跨域（Web :5002 → API :5003）时也能被
 * 浏览器附带。漏写 credentials 会静默导致 401，所以这里没有提供全局开关。
 */
export function createApiClient(options: CreateApiClientOptions): BailianStudioApiClient {
  const fetchImpl = options.fetch ?? fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  return {
    async getModels() {
      const data = await unwrapData(
        `${base}/api/models/catalog`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ModelCatalogResponseSchema,
      )
      return data.items
    },

    async getModel(id) {
      return unwrapData(
        `${base}/api/models/${encodeURIComponent(id)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ModelCatalogItemSchema,
      )
    },

    async getUsage() {
      const data = await unwrapData(
        `${base}/api/usage`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        UsageSummaryResponseSchema,
      )
      return data.usage
    },

    async getCreditBalance() {
      const data = await unwrapData(
        `${base}/api/account/points`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreditBalanceResponseSchema,
      )
      return data.balance
    },

    async listDirectorProjects(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/director/projects${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        DirectorProjectListResponseSchema,
      )
    },

    async createDirectorProject(input) {
      const data = await unwrapData(
        `${base}/api/director/projects`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        DirectorProjectResponseSchema,
      )
      return data.project
    },

    async getDirectorProject(id) {
      const data = await unwrapData(
        `${base}/api/director/projects/${encodeURIComponent(id)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        DirectorProjectResponseSchema,
      )
      return data.project
    },

    async updateDirectorProject(id, input) {
      const data = await unwrapData(
        `${base}/api/director/projects/${encodeURIComponent(id)}`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        DirectorProjectResponseSchema,
      )
      return data.project
    },

    async getGeneration(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        GenerationRecordSchema,
      )
    },

    async getGenerationDiagnostics(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/diagnostics`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        GenerationDiagnosticsSchema,
      )
    },

    async listGenerationArtifacts(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/artifacts`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListGenerationArtifactsResponseSchema,
      )
    },

    async listArtifacts(params = {}) {
      const query = new URLSearchParams()
      if (params.limit !== undefined) query.set('limit', String(params.limit))
      if (params.cursor !== undefined) query.set('cursor', params.cursor)
      if (params.kind !== undefined) query.set('kind', params.kind)
      const qs = query.toString()
      return unwrapData(
        `${base}/api/artifacts${qs.length > 0 ? `?${qs}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListArtifactsResponseSchema,
      )
    },

    async createGenerationShare(id, input = {}) {
      const hasOptions = input.includeParams !== undefined || input.expiresAt !== undefined
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/share`,
        {
          method: 'POST',
          credentials: 'include',
          ...(hasOptions ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          } : {}),
        },
        fetchImpl,
        GenerationShareResponseSchema,
      )
    },

    async getGenerationShare(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/share`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        GenerationShareResponseSchema,
      )
    },

    async revokeGenerationShare(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/share`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
        GenerationShareResponseSchema,
      )
    },

    async getSharedGeneration(shareId) {
      // 公开端点 —— 刻意不带 credentials，避免匿名访客的请求附带上原有 cookie，
      // 也呼应后端"该路由不要求会话"的设计。
      return unwrapData(
        `${base}/api/shares/generations/${encodeURIComponent(shareId)}`,
        { method: 'GET' },
        fetchImpl,
        PublicSharedGenerationResponseSchema,
      )
    },

    async createGeneration(input) {
      const body = {
        modelId: input.modelId,
        params: input.params,
        ...(input.assetRefs !== undefined ? { assetRefs: input.assetRefs } : {}),
        ...(input.batchId !== undefined ? { batchId: input.batchId } : {}),
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      }
      return unwrapData(
        `${base}/api/generations`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
          credentials: 'include',
        },
        fetchImpl,
        CreateGenerationResponseSchema,
      )
    },

    async estimateGeneration(input) {
      const body = {
        modelId: input.modelId,
        params: input.params,
        ...(input.assetRefs !== undefined ? { assetRefs: input.assetRefs } : {}),
      }
      const data = await unwrapData(
        `${base}/api/generations/estimate`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
          credentials: 'include',
        },
        fetchImpl,
        GenerationEstimateResponseSchema,
      )
      return data.estimate
    },

    async cancelGeneration(id) {
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        CancelGenerationResponseSchema,
      )
    },

    async retryGeneration(id, input) {
      // 仅当显式带 idempotencyKey 时才发 JSON body，否则发空 POST。
      const idempotencyKey = input?.idempotencyKey
      const hasBody = idempotencyKey !== undefined
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/retry`,
        hasBody
          ? {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ idempotencyKey }),
            credentials: 'include',
          }
          : { method: 'POST', credentials: 'include' },
        fetchImpl,
        RetryGenerationResponseSchema,
      )
    },

    async setGenerationLibraryState(id, state) {
      const data = await unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/library-state`,
        {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ state }),
          credentials: 'include',
        },
        fetchImpl,
        GenerationRecordUpdateResponseSchema,
      )
      return data.record
    },

    async listGenerations(params = {}) {
      const query = new URLSearchParams()
      if (params.limit !== undefined) query.set('limit', String(params.limit))
      if (params.cursor !== undefined) query.set('cursor', params.cursor)
      if (params.status !== undefined) query.set('status', params.status)
      if (params.views !== undefined && params.views.length > 0) {
        query.set('views', params.views.join(','))
      }
      const qs = query.toString()
      return unwrapData(
        `${base}/api/generations${qs.length > 0 ? `?${qs}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListGenerationsResponseSchema,
      )
    },

    async createMediaJob(input) {
      return unwrapData(
        `${base}/api/media/jobs`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
          credentials: 'include',
        },
        fetchImpl,
        CreateMediaJobResponseSchema,
      )
    },

    async getMediaJob(id) {
      const data = await unwrapData(
        `${base}/api/media/jobs/${encodeURIComponent(id)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        MediaJobResponseSchema,
      )
      return data.job
    },

    generationEventsUrl() {
      return `${base}/api/generations/events`
    },

    async uploadAsset(input) {
      const formData = new FormData()
      formData.append('file', input.file)
      if (input.kind !== undefined) formData.append('kind', input.kind)

      if (input.onProgress !== undefined && typeof XMLHttpRequest !== 'undefined') {
        return uploadAssetWithProgress(`${base}/api/assets/upload`, formData, input)
      }

      const parsed = await unwrapData(
        `${base}/api/assets/upload`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
          ...(input.signal !== undefined ? { signal: input.signal } : {}),
        },
        fetchImpl,
        AssetResponseSchema,
      )
      return parsed.asset
    },

    async importAsset(input) {
      const parsed = await unwrapData(
        `${base}/api/assets/import`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
          credentials: 'include',
        },
        fetchImpl,
        z.object({ asset: AssetItemSchema }),
      )
      return parsed.asset
    },

    async listAssets(params = {}) {
      const query = new URLSearchParams()
      if (params.limit !== undefined) query.set('limit', String(params.limit))
      if (params.cursor !== undefined) query.set('cursor', params.cursor)
      if (params.kind !== undefined) query.set('kind', params.kind)
      if (params.source !== undefined) query.set('source', params.source)
      if (params.sort !== undefined) query.set('sort', params.sort)
      if (params.q !== undefined) query.set('q', params.q)
      const qs = query.toString()
      return unwrapData(
        `${base}/api/assets${qs.length > 0 ? `?${qs}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListAssetsResponseSchema,
      )
    },

    async getAssetCapabilities() {
      return unwrapData(
        `${base}/api/assets/capabilities`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AssetCapabilitiesSchema,
      )
    },

    async getAsset(id) {
      const data = await unwrapData(
        `${base}/api/assets/${encodeURIComponent(id)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AssetResponseSchema,
      )
      return data.asset
    },

    async deleteAsset(id) {
      await requestNoContent(
        `${base}/api/assets/${encodeURIComponent(id)}`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
      )
    },

    async register(input) {
      const data = await unwrapData(
        `${base}/api/auth/register`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        RegistrationResponseSchema,
      )
      return data.registration
    },

    async verifyEmail(input) {
      const data = await unwrapData(
        `${base}/api/auth/verify-email`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async resendVerification(input) {
      return unwrapData(
        `${base}/api/auth/resend-verification`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        EmailActionAcceptedSchema,
      )
    },

    async forgotPassword(input) {
      return unwrapData(
        `${base}/api/auth/forgot-password`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        EmailActionAcceptedSchema,
      )
    },

    async resetPassword(input) {
      await requestNoContent(
        `${base}/api/auth/reset-password`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
      )
    },

    async changePassword(input) {
      const data = await unwrapData(
        `${base}/api/auth/change-password`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async unlinkGithub() {
      const data = await unwrapData(
        `${base}/api/auth/github/unlink`,
        { method: 'POST', headers: JSON_HEADERS, credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async updateProfile(input) {
      const data = await unwrapData(
        `${base}/api/auth/profile`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async uploadAvatar(file) {
      const formData = new FormData()
      formData.append('file', file)
      const data = await unwrapData(
        `${base}/api/auth/avatar`,
        { method: 'POST', body: formData, credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async removeAvatar() {
      const data = await unwrapData(
        `${base}/api/auth/avatar`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async logoutAll() {
      await requestNoContent(
        `${base}/api/auth/logout-all`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
      )
    },

    async login(input) {
      const data = await unwrapData(
        `${base}/api/auth/login`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AuthResponseSchema,
      )
      return data.user
    },

    async logout() {
      await requestNoContent(
        `${base}/api/auth/logout`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
      )
    },

    async getCurrentUser() {
      try {
        const data = await unwrapData(
          `${base}/api/auth/me`,
          { method: 'GET', credentials: 'include' },
          fetchImpl,
          AuthResponseSchema,
        )
        return data.user
      } catch (error) {
        // 401 是"未登录"的预期态，吞掉异常返回 null；其余错误（500、网络异常等）
        // 仍然向上抛出，让调用方区分"未登录"和"真正的故障"。
        if (error instanceof ApiClientError && error.status === 401) return null
        throw error
      }
    },

    async listAdminUsers(params = {}) {
      const search = new URLSearchParams()
      if (params.q !== undefined && params.q.length > 0) search.set('q', params.q)
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.page !== undefined) search.set('page', String(params.page))
      if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/users${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminListUsersResponseSchema,
      )
    },

    async adminGetStatsOverview() {
      return unwrapData(
        `${base}/api/admin/stats/overview`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminStatsOverviewSchema,
      )
    },

    async adminCreateUser(input) {
      const data = await unwrapData(
        `${base}/api/admin/users`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AdminUserResponseSchema,
      )
      return data.user
    },

    async adminGetUser(userId) {
      return unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminUserDetailResponseSchema,
      )
    },

    async adminUpdateUser(userId, input) {
      const data = await unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        AdminUserResponseSchema,
      )
      return data.user
    },

    async adminDeleteUser(userId) {
      await requestNoContent(
        `${base}/api/admin/users/${encodeURIComponent(userId)}`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
      )
    },

    async adminBanUser(userId) {
      await requestNoContent(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/ban`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
      )
    },

    async adminUnbanUser(userId) {
      await requestNoContent(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/unban`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
      )
    },

    async adminBatchBanUsers(input) {
      return unwrapData(
        `${base}/api/admin/users/batch-ban`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async adminBatchUnbanUsers(input) {
      return unwrapData(
        `${base}/api/admin/users/batch-unban`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async adminBatchDeleteUsers(input) {
      return unwrapData(
        `${base}/api/admin/users/batch-delete`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async adminBatchGrantPoints(input) {
      return unwrapData(
        `${base}/api/admin/users/batch-grant-points`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchGrantPointsResponseSchema,
      )
    },

    async adminGetUserPoints(userId) {
      const data = await unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/points`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreditBalanceResponseSchema,
      )
      return data.balance
    },

    async adminListUserPointsLedger(userId, params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/points/ledger${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListPointsLedgerResponseSchema,
      )
    },

    async adminGrantPoints(userId, input) {
      return unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/points/grants`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        PointsMutationResponseSchema,
      )
    },

    async adminAdjustPoints(userId, input) {
      return unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/points/adjustments`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        PointsMutationResponseSchema,
      )
    },

    async adminListUserAssets(userId, params = {}) {
      const search = new URLSearchParams()
      if (params.kind !== undefined) search.set('kind', params.kind)
      if (params.source !== undefined) search.set('source', params.source)
      if (params.sort !== undefined) search.set('sort', params.sort)
      if (params.q !== undefined && params.q.length > 0) search.set('q', params.q)
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/users/${encodeURIComponent(userId)}/assets${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListAssetsResponseSchema,
      )
    },

    async listGallery(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.category !== undefined) search.set('category', params.category)
      if (params.modelId !== undefined && params.modelId.length > 0) search.set('modelId', params.modelId)
      if (params.authorId !== undefined && params.authorId.length > 0) search.set('authorId', params.authorId)
      if (params.q !== undefined && params.q.length > 0) search.set('q', params.q)
      if (params.sort !== undefined && params.sort !== 'latest') search.set('sort', params.sort)
      const query = search.toString()
      return unwrapData(
        `${base}/api/gallery${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListGalleryResponseSchema,
      )
    },

    async listMyFavorites(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/gallery/favorites${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListGalleryResponseSchema,
      )
    },

    async getGalleryGeneration(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        GalleryDetailSchema,
      )
    },

    async setGenerationVisibility(recordId, visibility) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/visibility`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ visibility }), credentials: 'include' },
        fetchImpl,
        SetVisibilityResponseSchema,
      )
    },

    async likeGeneration(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/like`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        LikeMutationResponseSchema,
      )
    },

    async unlikeGeneration(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/like`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
        LikeMutationResponseSchema,
      )
    },

    async favoriteGeneration(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/favorite`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        FavoriteMutationResponseSchema,
      )
    },

    async unfavoriteGeneration(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/favorite`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
        FavoriteMutationResponseSchema,
      )
    },

    async getGenerationFavorite(recordId) {
      return unwrapData(
        `${base}/api/gallery/generations/${encodeURIComponent(recordId)}/favorite`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        FavoriteMutationResponseSchema,
      )
    },

    async listPromptLibrary(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.q !== undefined && params.q.length > 0) search.set('q', params.q)
      const query = search.toString()
      return unwrapData(
        `${base}/api/prompt-library${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListPromptLibraryResponseSchema,
      )
    },

    async createPromptLibraryItem(input) {
      const data = await unwrapData(
        `${base}/api/prompt-library`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        PromptLibraryItemResponseSchema,
      )
      return data.item
    },

    async updatePromptLibraryItem(itemId, input) {
      const data = await unwrapData(
        `${base}/api/prompt-library/${encodeURIComponent(itemId)}`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        PromptLibraryItemResponseSchema,
      )
      return data.item
    },

    async deletePromptLibraryItem(itemId) {
      await requestNoContent(
        `${base}/api/prompt-library/${encodeURIComponent(itemId)}`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
      )
    },

    async adminListModelCosts() {
      return unwrapData(
        `${base}/api/admin/model-costs`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminModelCostsResponseSchema,
      )
    },

    async adminUpdateModelCosts(entries) {
      return unwrapData(
        `${base}/api/admin/model-costs`,
        { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ entries }), credentials: 'include' },
        fetchImpl,
        AdminModelCostsUpdateResponseSchema,
      )
    },

    async adminGetAnalytics(params = {}) {
      const search = new URLSearchParams()
      if (params.from !== undefined) search.set('from', params.from)
      if (params.to !== undefined) search.set('to', params.to)
      if (params.days !== undefined) search.set('days', String(params.days))
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/stats/analytics${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminAnalyticsSchema,
      )
    },

    async submitFeedback(input) {
      const data = await unwrapData(
        `${base}/api/feedback`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        FeedbackItemResponseSchema,
      )
      return data.item
    },

    async listMyFeedback(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/feedback${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListFeedbackResponseSchema,
      )
    },

    async adminListFeedback(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.status !== undefined) search.set('status', params.status)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/feedback${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListFeedbackResponseSchema,
      )
    },

    async adminUpdateFeedbackStatus(itemId, status) {
      const data = await unwrapData(
        `${base}/api/admin/feedback/${encodeURIComponent(itemId)}`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ status }), credentials: 'include' },
        fetchImpl,
        FeedbackItemResponseSchema,
      )
      return data.item
    },

    async submitContentReport(input) {
      const data = await unwrapData(
        `${base}/api/reports`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        ContentReportItemResponseSchema,
      )
      return data.report
    },

    async adminListContentReports(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.status !== undefined) search.set('status', params.status)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/reports${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListContentReportsResponseSchema,
      )
    },

    async adminUpdateContentReport(reportId, input) {
      const data = await unwrapData(
        `${base}/api/admin/reports/${encodeURIComponent(reportId)}`,
        { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        ContentReportItemResponseSchema,
      )
      return data.report
    },

    async adminListTasks(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.status !== undefined) search.set('status', params.status)
      if (params.type !== undefined && params.type.length > 0) search.set('type', params.type)
      if (params.domain !== undefined && params.domain.length > 0) search.set('domain', params.domain)
      if (params.userId !== undefined && params.userId.length > 0) search.set('userId', params.userId)
      if (params.recordId !== undefined && params.recordId.length > 0) search.set('recordId', params.recordId)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/tasks${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListAdminTasksResponseSchema,
      )
    },

    async adminListGallery(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      if (params.includeHidden === true) search.set('includeHidden', 'true')
      if (params.q !== undefined && params.q.length > 0) search.set('q', params.q)
      if (params.authorId !== undefined && params.authorId.length > 0) search.set('authorId', params.authorId)
      const query = search.toString()
      return unwrapData(
        `${base}/api/admin/gallery${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListAdminGalleryResponseSchema,
      )
    },

    async adminListGalleryArtifacts(recordId) {
      return unwrapData(
        `${base}/api/admin/gallery/${encodeURIComponent(recordId)}/artifacts`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        AdminGalleryArtifactsResponseSchema,
      )
    },

    async adminHideGalleryItem(recordId) {
      return unwrapData(
        `${base}/api/admin/gallery/${encodeURIComponent(recordId)}/hide`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        AdminGalleryHideResultSchema,
      )
    },

    async adminUnhideGalleryItem(recordId) {
      return unwrapData(
        `${base}/api/admin/gallery/${encodeURIComponent(recordId)}/unhide`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        AdminGalleryHideResultSchema,
      )
    },

    async adminBatchHideGallery(input) {
      return unwrapData(
        `${base}/api/admin/gallery/batch-hide`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async adminBatchUnhideGallery(input) {
      return unwrapData(
        `${base}/api/admin/gallery/batch-unhide`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async adminBatchDeleteGallery(input) {
      return unwrapData(
        `${base}/api/admin/gallery/batch-delete`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input), credentials: 'include' },
        fetchImpl,
        BatchAffectedResponseSchema,
      )
    },

    async listNotifications(params = {}) {
      const search = new URLSearchParams()
      if (params.limit !== undefined) search.set('limit', String(params.limit))
      if (params.cursor !== undefined) search.set('cursor', params.cursor)
      const query = search.toString()
      return unwrapData(
        `${base}/api/notifications${query.length > 0 ? `?${query}` : ''}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        ListNotificationsResponseSchema,
      )
    },

    async getNotificationUnreadCount() {
      return unwrapData(
        `${base}/api/notifications/unread-count`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        NotificationUnreadCountSchema,
      )
    },

    async markNotificationRead(notificationId) {
      return unwrapData(
        `${base}/api/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        NotificationReadSchema,
      )
    },

    async markAllNotificationsRead() {
      return unwrapData(
        `${base}/api/notifications/read-all`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        NotificationReadAllSchema,
      )
    },
  }
}
