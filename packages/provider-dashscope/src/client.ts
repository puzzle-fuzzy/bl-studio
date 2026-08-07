/**
 * DashScope（百炼）provider 的 HTTP 客户端：实现"提交 → 轮询 → 完成/失败"的核心
 * 状态机，是 @bailian-studio/worker 调用 DashScope 的入口。
 *
 * 统一路径：所有模型的提交/轮询/取消端点、请求头、任务状态值都来自
 * manifest.transport（见 transport.ts），不再区分 sdk/legacy 两条分支。请求发出前
 * validateModelParams 做参数自检（漂移的 manifest 在 fetch 之前被拦截）；响应用
 * assertResponseShape 做结构性校验——天然 lenient，接受一切未知字段，只在缺关键字段
 * 或状态无法识别时报告问题。
 *
 * 所有 HTTP 层异常（网络错误、非 2xx）都被包装成 DashScopeHttpError，错误信息经
 * classifyDashScopeError 归一分类，供 worker 决定重试或判失败。
 */
import type { FrozenModelManifest } from '@bailian-studio/model-core'
import { classifyTaskStatus } from '@bailian-studio/model-core'
import { classifyDashScopeError, type ProviderErrorInfo } from './errors'
import {
  assertProviderResponseContract,
  assertStreamEvent,
  resolveTransportTarget,
  validateRequestParams,
  type BailianContractLocale,
} from './contract'
import {
  resolveDashScopeCancelTarget,
  resolveDashScopePollTarget,
  resolveDashScopeSubmitTarget,
} from './transport'
import {
  DashScopeHttpError,
  createManifestHeaders,
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

export type { DashScopeFetch } from './http'
export { DashScopeHttpError } from './http'

/** 创建 client 的选项：apiKey 必填，fetch 可注入便于测试。 */
export interface CreateDashScopeClientOptions {
  apiKey: string
  fetch?: DashScopeFetch
  /** Keling、HappyHorse、Fun Music 等工作空间专属端点所需。 */
  workspaceId?: string
  /** 契约校验错误的输出语言。 */
  contractLocale?: BailianContractLocale
  /** 单次 provider HTTP 请求超过该时长后中止。 */
  requestTimeoutMs?: number
}

/** 提交请求入参：模型 manifest + 用户传来的参数。 */
export interface ProviderSubmitInput {
  manifest: FrozenModelManifest
  params: Record<string, unknown>
  /** 每次生成的稳定提交标识，用于保证 provider 重试安全。 */
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
 * fetch 可注入：测试时可传假 fetch。返回的 submit/poll 方法内部已封装错误分类与
 * 状态映射，调用方只需按 result.mode 分支。
 */
export function createDashScopeClient(options: CreateDashScopeClientOptions): DashScopeClient {
  const fetchImpl = options.fetch ?? fetch
  const contractLocale = options.contractLocale ?? 'zh-CN'
  const requestTimeoutMs = options.requestTimeoutMs ?? 60_000
  const transportOptions = { workspaceId: options.workspaceId }

  return {
    async submit(input) {
      const request = buildDashScopeRequest(input.manifest, input.params)
      validateRequestParams(input.manifest, input.params, contractLocale)
      const target = resolveTransportTarget(() => resolveDashScopeSubmitTarget(input.manifest, transportOptions))
      const headers = createManifestHeaders(options.apiKey, target.headers)
      if (request.async) headers.set('X-DashScope-Async', 'enable')
      if (input.idempotencyKey !== undefined) {
        headers.set('X-DashScope-Idempotency-Key', input.idempotencyKey)
      }

      const raw = await requestJson(fetchImpl, target.url, {
        method: target.method,
        headers,
        body: JSON.stringify(request.body),
      }, (responseBody, response) => assertProviderResponseContract(
        input.manifest,
        response.ok ? (request.async ? 'submit' : 'final') : 'error',
        responseBody,
        response,
        contractLocale,
      ), requestTimeoutMs)

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
      const target = resolveTransportTarget(() => resolveDashScopePollTarget(input.manifest, input.providerTaskId, transportOptions))
      const headers = createManifestHeaders(options.apiKey, target.headers)

      const raw = await requestJson(fetchImpl, target.url, {
        method: target.method,
        headers,
      }, (responseBody, response) => {
        if (!response.ok) {
          assertProviderResponseContract(input.manifest, 'error', responseBody, response, contractLocale)
          return
        }
        const providerStatus = getStringPath(responseBody, 'output.task_status')
        const lifecycle = providerStatus === undefined
          ? undefined
          : classifyTaskStatus(input.manifest, providerStatus)
        // 失败任务响应以宽容形状通过（'error' 阶段对 record 全宽容），交由错误分类；
        // 成功终态才要求产物字段齐全。
        const phase = lifecycle === 'failed'
          ? 'error'
          : lifecycle === 'succeeded'
            ? 'final'
            : 'poll'
        assertProviderResponseContract(input.manifest, phase, responseBody, response, contractLocale)
      }, requestTimeoutMs)

      const requestId = getStringPath(raw, 'request_id')
      const providerStatus = getStringPath(raw, 'output.task_status')
      // 归一为小写以兼容 DashScope 不同接口大小写不一的状态字符串。
      const taskLifecycle = providerStatus === undefined
        ? 'unknown'
        : classifyTaskStatus(input.manifest, providerStatus)

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
      const target = resolveTransportTarget(() => resolveDashScopeCancelTarget(input.manifest, input.providerTaskId, transportOptions))
      const headers = createManifestHeaders(options.apiKey, target.headers)

      try {
        const raw = await requestJson(fetchImpl, target.url, {
          method: target.method,
          headers,
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
      validateRequestParams(input.manifest, input.params, contractLocale)
      const target = resolveTransportTarget(() => resolveDashScopeSubmitTarget(input.manifest, transportOptions))
      const streamHeaders = input.manifest.transport.mode === 'provider_async'
        ? []
        : (input.manifest.transport.stream?.headers ?? [])
      const headers = createManifestHeaders(options.apiKey, [...target.headers, ...streamHeaders])

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
        assertProviderResponseContract(input.manifest, 'error', raw, response, contractLocale)
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
          (event) => assertStreamEvent(input.manifest, event, contractLocale),
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
