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
  AssetCapabilitiesSchema,
  AssetItemSchema,
  AssetResponseSchema,
  ApiErrorSchema,
  BailianContractStatusSchema,
  AuthResponseSchema,
  CancelGenerationResponseSchema,
  CreditBalanceResponseSchema,
  CreateGenerationResponseSchema,
  EmailActionAcceptedSchema,
  GenerationEstimateResponseSchema,
  GenerationDiagnosticsSchema,
  CreateMediaJobResponseSchema,
  GenerationRecordSchema,
  GenerationShareResponseSchema,
  ListArtifactsResponseSchema,
  ListAssetsResponseSchema,
  ListGenerationArtifactsResponseSchema,
  ListGenerationsResponseSchema,
  MediaJobResponseSchema,
  ModelCatalogItemSchema,
  ModelCatalogResponseSchema,
  PublicSharedGenerationResponseSchema,
  RegistrationResponseSchema,
  RetryGenerationResponseSchema,
  UsageSummaryResponseSchema,
} from './schemas'
import type {
  AssetCapabilities,
  AssetItem,
  BailianContractStatus,
  CancelGenerationResult,
  CreditBalance,
  CreateGenerationResponse,
  EmailActionAccepted,
  GenerationEstimate,
  GenerationDiagnostics,
  CreateMediaJobResult,
  GenerationRecord,
  GenerationShareResult,
  ListArtifactsResult,
  ListAssetsResult,
  ListGenerationArtifactsResult,
  ListGenerationsResult,
  MediaJob,
  ModelCatalogItem,
  PublicSharedGeneration,
  PublicUser,
  RegistrationResult,
  RetryGenerationResult,
  UsageSummary,
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
  /** `GET /api/models/bailian-contract` —— 获取运行中 SDK 目录版本与覆盖基线。 */
  getBailianContractStatus(): Promise<BailianContractStatus>
  /** `GET /api/usage` —— 当前用户本月的生成量和成本聚合。 */
  getUsage(): Promise<UsageSummary>
  /** `GET /api/account/points` — 获取当前用户的可用、冻结和总积分。 */
  getCreditBalance(): Promise<CreditBalance>
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

    async getBailianContractStatus() {
      return unwrapData(
        `${base}/api/models/bailian-contract`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        BailianContractStatusSchema,
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
      const hasBody = input?.idempotencyKey !== undefined
      return unwrapData(
        `${base}/api/generations/${encodeURIComponent(id)}/retry`,
        hasBody
          ? {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ idempotencyKey: input!.idempotencyKey }),
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
        CancelGenerationResponseSchema,
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
  }
}
