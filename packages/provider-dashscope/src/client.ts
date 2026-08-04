/**
 * DashScope（百炼）provider 的 HTTP 客户端：实现"提交 → 轮询 → 完成/失败"的核心
 * 状态机，是 @bailian-studio/worker 调用 DashScope 的入口。
 *
 * 两条主路径：
 *  - submit：按 manifest 构建请求体并 POST 到 endpoint。同步模式（taskMode 非
 *    provider_async）直接返回 completed + 归一化结果；异步模式则带上
 *    X-DashScope-Async 头提交，返回 polling + providerTaskId 交给 worker 后续轮询。
 *  - poll：GET /tasks/<id> 查询异步任务状态，按 output.task_status 映射到
 *    pending（继续轮询）/ completed（取结果）/ failed（分类错误）。
 *
 * 所有 HTTP 层异常（网络错误、非 2xx）都被包装成 DashScopeHttpError，错误信息经
 * classifyDashScopeError 归一分类，供 worker 决定重试或判失败。
 */
import type { FrozenModelManifest } from '@bailian-studio/model-core'
import {
  classifyBailianTaskStatus,
  getBailianIntegrationStatus,
  resolveBailianCancelTarget,
  resolveBailianPollTarget,
  resolveBailianSubmitTarget,
  validateBailianHttpRequest,
  validateBailianResponse,
} from '@bailian-studio/bailian-adapter'
import { classifyDashScopeError, type ProviderErrorInfo } from './errors'
import {
  assertProviderContract,
  assertProviderResponseContract,
  resolveAdapterTarget,
} from './contract'
import {
  DashScopeHttpError,
  createLegacyHeaders,
  createSdkHeaders,
  getStringPath,
  readResponseBody,
  requestJson,
  withHttpStatus,
  type DashScopeFetch,
} from './http'
import { buildDashScopeRequest } from './request-builder'
import { parseDashScopeOutput, type NormalizedArtifact, type NormalizedOutput } from './response-parser'
import { SseEventParseError, readSseStream, type SseResult } from './sse-reader'
import { buildChatRequest } from './chat-builder'

// base URL 内含 /api/v1 版本前缀，于是 manifest 里的 endpoint 可以保持相对路径
// （如 '/services/audio/music/generation'）。这与 DashScope 官方文档及线上 uhyc
// 客户端一致——因此下方轮询路径是 '/tasks/<id>'，而非 '/api/v1/tasks/<id>'。
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'

export type { DashScopeFetch } from './http'
export { DashScopeHttpError } from './http'

/** 创建 client 的选项：apiKey 必填，fetch 与 baseUrl 可注入便于测试与自定 host。 */
export interface CreateDashScopeClientOptions {
  apiKey: string
  fetch?: DashScopeFetch
  baseUrl?: string
  /** Optional OpenAI-compatible chat root; defaults to the provider host derived from baseUrl. */
  chatBaseUrl?: string
  /** Keling、HappyHorse、Fun Music 等工作空间专属端点所需。 */
  workspaceId?: string
  /** Contract v3 校验错误的输出语言。 */
  contractLocale?: 'zh-CN' | 'en-US'
  /** Abort an individual provider HTTP request after this duration. */
  requestTimeoutMs?: number
}

/** 提交请求入参：模型 manifest + 用户传来的参数。 */
export interface ProviderSubmitInput {
  manifest: FrozenModelManifest
  params: Record<string, unknown>
  /** Stable per-generation submission identity used to make provider retries safe. */
  idempotencyKey?: string
}

/**
 * 提交结果。两条分支构成 DashScope 的同步/异步两种提交语义：
 *  - completed：同步接口，响应里已含最终结果，直接归一化为 output；
 *  - polling：异步接口，响应只给一个 providerTaskId，worker 需后续轮询。
 */
export type ProviderSubmitResult =
  | { mode: 'completed'; raw: unknown; output: NormalizedOutput; providerStatus?: string; requestId?: string }
  | { mode: 'polling'; providerTaskId: string; providerStatus?: string; raw: unknown; nextPollAt?: string; requestId?: string }

/** 轮询请求入参：manifest + 上一次 submit 拿到的 providerTaskId。 */
export interface ProviderPollInput {
  manifest: FrozenModelManifest
  providerTaskId: string
}

/**
 * 轮询结果。三种 mode 对应异步任务的三类终态/中间态：
 *  - pending：任务仍在运行（task_status 为 pending/running），worker 应继续轮询；
 *  - completed：任务成功（task_status 为 succeeded/success/completed），取归一化结果；
 *  - failed：任务失败或状态缺失/未知，附带分类后的 error，供 worker 决定重试或判败。
 */
export type ProviderPollResult =
  | { mode: 'pending'; providerStatus?: string; raw: unknown; nextPollAt?: string; requestId?: string }
  | { mode: 'completed'; providerStatus?: string; raw: unknown; output: NormalizedOutput; requestId?: string }
  | { mode: 'failed'; providerStatus?: string; raw: unknown; error: ProviderErrorInfo; requestId?: string }

/** 主动取消一个已提交的异步 provider 任务。 */
export interface ProviderCancelInput {
  manifest: FrozenModelManifest
  providerTaskId: string
}

export type ProviderCancelResult =
  | { mode: 'cancelled'; raw: unknown; requestId?: string }
  | { mode: 'unsupported'; raw: unknown; requestId?: string; reason: string }

export interface ProviderChatInput {
  manifest: FrozenModelManifest
  params: Record<string, unknown>
}

export type ProviderChatResult =
  | { mode: 'completed'; output: NormalizedOutput; requestId?: string }
  | { mode: 'failed'; error: ProviderErrorInfo; requestId?: string }

/** DashScope 客户端契约：submit 提交、poll 轮询、chat 流式对话。 */
export interface DashScopeClient {
  submit(input: ProviderSubmitInput): Promise<ProviderSubmitResult>
  poll(input: ProviderPollInput): Promise<ProviderPollResult>
  cancel(input: ProviderCancelInput): Promise<ProviderCancelResult>
  chat(input: ProviderChatInput): Promise<ProviderChatResult>
}

/**
 * 创建一个 DashScope 客户端实例。
 *
 * fetch 与 baseUrl 均可注入：测试时可传假 fetch；线上可改 baseUrl 走代理或私有端点。
 * 返回的 submit/poll 方法内部已封装错误分类与状态映射，调用方只需按 result.mode 分支。
 */
export function createDashScopeClient(options: CreateDashScopeClientOptions): DashScopeClient {
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)
  const chatBaseUrl = normalizeBaseUrl(options.chatBaseUrl ?? deriveChatBaseUrl(baseUrl))
  const contractLocale = options.contractLocale ?? 'zh-CN'
  const requestTimeoutMs = options.requestTimeoutMs ?? 60_000

  return {
    async submit(input) {
      const request = buildDashScopeRequest(input.manifest, input.params)
      const integration = getBailianIntegrationStatus(input.manifest.id)
      const target = integration.kind === 'sdk'
        ? resolveAdapterTarget(() => resolveBailianSubmitTarget(
            input.manifest.id,
            options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
            contractLocale,
          ))
        : { method: 'POST', url: `${baseUrl}${request.endpoint}` }
      const headers = 'headers' in target
        ? createSdkHeaders(options.apiKey, target.headers)
        : createLegacyHeaders(options.apiKey, request.async)
      if (input.idempotencyKey !== undefined) {
        headers.set('X-DashScope-Idempotency-Key', input.idempotencyKey)
      }

      if (integration.kind === 'sdk') {
        assertProviderContract(
          validateBailianHttpRequest(input.manifest.id, {
            method: target.method,
            url: target.url,
            headers,
            body: request.body,
          }, contractLocale),
          contractLocale,
          request.body,
        )
      }

      const raw = await requestJson(fetchImpl, target.url, {
        method: target.method,
        headers,
        body: JSON.stringify(request.body),
      }, integration.kind === 'sdk'
        ? (responseBody, response) => assertProviderResponseContract(
            validateBailianResponse(
              input.manifest.id,
              response.ok ? (request.async ? 'submit' : 'final') : 'error',
              responseBody,
              contractLocale,
            ),
            contractLocale,
            responseBody,
            response,
          )
        : undefined, requestTimeoutMs)

      const requestId = getStringPath(raw, 'request_id')
      const providerStatus = getStringPath(raw, 'output.task_status')

      // 同步模式：响应即最终结果，直接归一化为 output 并以 completed 返回。
      if (!request.async) {
        return {
          mode: 'completed',
          raw,
          output: parseDashScopeOutput(input.manifest, raw),
          requestId,
          ...(providerStatus !== undefined ? { providerStatus } : {}),
        }
      }

      // 异步模式：必须拿到 output.task_id 才能后续轮询；缺失说明 provider 响应异常，
      // 归为可重试错误，让 worker 有机会再试一次而非直接判败。
      const providerTaskId = getStringPath(raw, 'output.task_id')
      if (providerTaskId === undefined) {
        throw new DashScopeHttpError(
          {
            category: 'provider',
            retriable: true,
            message: 'DashScope async response did not include output.task_id',
          },
          undefined,
          raw,
        )
      }

      return {
        mode: 'polling',
        providerTaskId,
        requestId,
        ...(providerStatus !== undefined ? { providerStatus } : {}),
        raw,
      }
    },

    async poll(input) {
      const integration = getBailianIntegrationStatus(input.manifest.id)
      const target = integration.kind === 'sdk'
        ? resolveAdapterTarget(() => resolveBailianPollTarget(
            input.manifest.id,
            input.providerTaskId,
            options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
            contractLocale,
          ))
        : {
            method: 'GET',
            url: `${baseUrl}/tasks/${encodeURIComponent(input.providerTaskId)}`,
          }

      const raw = await requestJson(fetchImpl, target.url, {
        method: target.method,
        headers: 'headers' in target
          ? createSdkHeaders(options.apiKey, target.headers)
          : createLegacyHeaders(options.apiKey),
      }, integration.kind === 'sdk'
        ? (responseBody, response) => {
            const status = getStringPath(responseBody, 'output.task_status')?.toLowerCase()
            const lifecycle = status === undefined
              ? undefined
              : classifyBailianTaskStatus(input.manifest.id, status, contractLocale)
            const phase = !response.ok
              ? 'error'
              : lifecycle === 'succeeded'
                ? 'final'
                : 'poll'
            const validation = response.ok && lifecycle === 'failed'
              ? (() => {
                  const taskError = validateBailianResponse(
                    input.manifest.id,
                    'error',
                    responseBody,
                    contractLocale,
                  )
                  return taskError.valid
                    ? taskError
                    : validateBailianResponse(input.manifest.id, 'poll', responseBody, contractLocale)
                })()
              : validateBailianResponse(input.manifest.id, phase, responseBody, contractLocale)
            assertProviderResponseContract(
              validation,
              contractLocale,
              responseBody,
              response,
            )
          }
        : undefined, requestTimeoutMs)

      const requestId = getStringPath(raw, 'request_id')
      const providerStatus = getStringPath(raw, 'output.task_status')
      // 归一为小写以兼容 DashScope 不同接口大小写不一的状态字符串。
      const normalizedStatus = providerStatus?.toLowerCase()
      const taskLifecycle = integration.kind === 'sdk' && providerStatus !== undefined
        ? classifyBailianTaskStatus(input.manifest.id, providerStatus, contractLocale)
        : classifyLegacyTaskStatus(normalizedStatus)

      if (taskLifecycle === 'pending') {
        return {
          mode: 'pending',
          ...(providerStatus !== undefined ? { providerStatus } : {}),
          requestId,
          raw,
        }
      }

      if (taskLifecycle === 'failed') {
        return {
          mode: 'failed',
          ...(providerStatus !== undefined ? { providerStatus } : {}),
          requestId,
          raw,
          error: classifyTerminalTaskError(raw, providerStatus),
        }
      }

      if (taskLifecycle === 'succeeded') {
        return {
          mode: 'completed',
          ...(providerStatus !== undefined ? { providerStatus } : {}),
          requestId,
          raw,
          output: parseDashScopeOutput(input.manifest, raw),
        }
      }

      // 状态缺失或为未知值：无法判定终态，按 provider 可重试错误返回 failed，
      // 避免把无法理解的响应静默吞掉、也避免无限轮询下去。
      return {
        mode: 'failed',
        ...(providerStatus !== undefined ? { providerStatus } : {}),
        requestId,
        raw,
        error: {
          category: 'provider',
          retriable: true,
          message:
            providerStatus === undefined
              ? 'DashScope task response did not include output.task_status'
              : `DashScope task returned unknown status: ${providerStatus}`,
        },
      }
    },

    async cancel(input) {
      const integration = getBailianIntegrationStatus(input.manifest.id)
      const target = integration.kind === 'sdk'
        ? resolveAdapterTarget(() => resolveBailianCancelTarget(
            input.manifest.id,
            input.providerTaskId,
            options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
            contractLocale,
          ))
        : {
            method: 'POST',
            url: `${baseUrl}/tasks/${encodeURIComponent(input.providerTaskId)}/cancel`,
          }

      try {
        const raw = await requestJson(fetchImpl, target.url, {
          method: target.method,
          headers: 'headers' in target
            ? createSdkHeaders(options.apiKey, target.headers)
            : createLegacyHeaders(options.apiKey),
        }, undefined, requestTimeoutMs)
        return {
          mode: 'cancelled',
          raw,
          requestId: getStringPath(raw, 'request_id'),
        }
      } catch (error) {
        if (error instanceof DashScopeHttpError && isCancellationUnsupported(error)) {
          return {
            mode: 'unsupported',
            raw: error.raw,
            requestId: getStringPath(error.raw, 'request_id'),
            reason: error.info.message,
          }
        }
        throw error
      }
    },

    async chat(input) {
      const body = buildChatRequest(input.manifest, input.params)
      const integration = getBailianIntegrationStatus(input.manifest.id)
      const target = integration.kind === 'sdk'
        ? resolveAdapterTarget(() => resolveBailianSubmitTarget(
            input.manifest.id,
            options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
            contractLocale,
          ))
        : { method: 'POST', url: `${chatBaseUrl}/chat/completions` }
      const headers = 'headers' in target
        ? createSdkHeaders(options.apiKey, target.headers)
        : new Headers({
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          })

      if (integration.kind === 'sdk') {
        assertProviderContract(
          validateBailianHttpRequest(input.manifest.id, {
            method: target.method,
            url: target.url,
            headers,
            body,
          }, contractLocale),
          contractLocale,
          body,
        )
      }

      let response: Response
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
      try {
        response = await fetchImpl(target.url, {
          method: target.method,
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch (error) {
        clearTimeout(timeout)
        if (controller.signal.aborted) {
          throw new DashScopeHttpError(
            { category: 'timeout', retriable: true, code: 'PROVIDER_REQUEST_TIMEOUT', message: `Provider request timed out after ${requestTimeoutMs}ms` },
            undefined,
            error,
          )
        }
        throw new DashScopeHttpError(
          {
            category: 'network',
            retriable: true,
            message: error instanceof Error ? error.message : String(error),
          },
          undefined,
          error,
        )
      }
      if (!response.ok) {
        const raw = await readResponseBody(response)
        clearTimeout(timeout)
        if (integration.kind === 'sdk') {
          assertProviderResponseContract(
            validateBailianResponse(input.manifest.id, 'error', raw, contractLocale),
            contractLocale,
            raw,
            response,
          )
        }
        throw new DashScopeHttpError(
          classifyDashScopeError(withHttpStatus(raw, response.status)),
          response.status,
          raw,
        )
      }

      let stream: SseResult
      try {
        stream = await readSseStream(
          response,
          controller.signal,
          integration.kind === 'sdk'
            ? (event) => assertProviderContract(
                validateBailianResponse(input.manifest.id, 'stream-event', event, contractLocale),
                contractLocale,
                event,
              )
            : undefined,
        )
        if (controller.signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError')
        }
      }
      catch (error) {
        if (controller.signal.aborted) {
          throw new DashScopeHttpError(
            { category: 'timeout', retriable: true, code: 'PROVIDER_REQUEST_TIMEOUT', message: `Provider stream timed out after ${requestTimeoutMs}ms` },
            undefined,
            error,
          )
        }
        if (error instanceof DashScopeHttpError) throw error
        if (error instanceof SseEventParseError) {
          throw new DashScopeHttpError({
            category: 'validation',
            retriable: false,
            code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
            message: error.message,
            details: { line: error.line },
          }, undefined, error.line)
        }
        throw new DashScopeHttpError(
          { category: 'network', retriable: true, message: error instanceof Error ? error.message : String(error) },
          undefined,
          error,
        )
      }
      finally {
        clearTimeout(timeout)
      }

      const { text, usage } = stream

      const artifacts: NormalizedArtifact[] = [
        { kind: 'text', text, mimeType: 'text/markdown' },
      ]

      const output: NormalizedOutput = {
        artifacts,
        ...(usage !== undefined ? { usage } : {}),
        raw: { text },
      }

      return {
        mode: 'completed' as const,
        output,
      }
    },
  }
}

/** 去掉 baseUrl 结尾的多余斜杠，避免与 manifest 的相对 endpoint 拼出双斜杠。 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function deriveChatBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith('/api/v1')) return `${baseUrl.slice(0, -'/api/v1'.length)}/compatible-mode/v1`
  if (baseUrl.endsWith('/compatible-mode/v1')) return baseUrl
  return `${baseUrl}/compatible-mode/v1`
}

function classifyLegacyTaskStatus(
  status: string | undefined,
): 'pending' | 'succeeded' | 'failed' | 'unknown' {
  if (status === 'pending' || status === 'running') return 'pending'
  if (status === 'succeeded' || status === 'success' || status === 'completed') return 'succeeded'
  if (status === 'failed' || status === 'canceled' || status === 'cancelled') return 'failed'
  return 'unknown'
}

function classifyTerminalTaskError(raw: unknown, providerStatus: string | undefined): ProviderErrorInfo {
  const classified = classifyDashScopeError(raw)
  const normalized = providerStatus?.toLowerCase()
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return {
      ...classified,
      category: 'cancelled',
      retriable: false,
      code: classified.code ?? 'DASHSCOPE_TASK_CANCELED',
    }
  }
  return { ...classified, retriable: false }
}

function isCancellationUnsupported(error: DashScopeHttpError): boolean {
  if (error.status !== 400) return false
  const code = error.info.code?.toLowerCase() ?? ''
  const message = error.info.message.toLowerCase()
  return code.includes('unsupportedoperation')
    || code.includes('tasknotpending')
    || message.includes('not pending')
    || message.includes('cannot be canceled')
    || message.includes('cannot be cancelled')
}
