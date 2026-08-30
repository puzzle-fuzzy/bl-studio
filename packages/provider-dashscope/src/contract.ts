/**
 * provider 执行层与 model-core 纯函数之间的错误映射层。
 *
 * model-core 提供不抛错的通用参数校验，DashScope manifest 包提供 response-shape 校验，这里把
 * 它们的"失败"翻译成调用方（worker）依赖的 DashScopeHttpError，并钉住三类错误码：
 *  - DASHSCOPE_*：传输解析失败（工作空间缺失/非法、端点不受信等），由 ModelCoreError
 *    映射而来（见 resolveTransportTarget）；
 *  - PARAMETER_VALIDATION_FAILED：请求参数不满足 manifest 约束，在
 *    fetch 之前抛出（漂移的 manifest 被提前拦截）；
 *  - RESPONSE_SCHEMA_MISMATCH：成功响应缺关键字段（非 2xx 响应则
 *    以 HTTP 状态和 provider 错误码决定重试策略，契约问题附加为诊断信息）。
 */
import {
  ModelCoreError,
  validateModelParams,
  type ParameterValidationIssue,
} from '@bailian-studio/model-core'
import {
  assertResponseShape,
  type FrozenModelManifest,
  type ResponseShapeIssue,
} from '@bailian-studio/dashscope-manifests'
import { classifyDashScopeError } from './errors'
import { DashScopeHttpError, withHttpStatus } from './http'

export type ProviderErrorLocale = 'zh-CN' | 'en-US'

/** 传输解析（transport.ts）抛出的 ModelCoreError 统一映射为 provider 校验错误。 */
export function resolveTransportTarget<T>(resolve: () => T): T {
  try {
    return resolve()
  } catch (error) {
    if (error instanceof ModelCoreError) {
      throw new DashScopeHttpError({
        category: 'validation',
        retriable: false,
        code: `DASHSCOPE_${error.code}`,
        message: error.message,
        details: isRecordDetails(error.details) ? error.details : undefined,
      }, undefined, error.details)
    }
    throw error
  }
}

/**
 * 请求自检：validateModelParams 不满足 manifest 约束时，在发请求之前拒绝。
 * 参数错误路径按 binding 落点生成 JSON pointer（如 /parameters/retired_seed），
 * 与响应校验路径的路径风格一致。
 */
export function validateRequestParams(
  manifest: FrozenModelManifest,
  params: Record<string, unknown>,
  locale: ProviderErrorLocale,
): void {
  const result = validateModelParams(manifest, params)
  if (result.valid) return
  const diagnostics = paramDiagnostics(manifest, result.errors)
  throw new DashScopeHttpError({
    category: 'validation',
    retriable: false,
    code: 'PARAMETER_VALIDATION_FAILED',
    message: diagnostics.messages[locale],
    details: diagnostics,
  }, undefined, { contractValidation: diagnostics, raw: params })
}

/**
 * 成功响应的契约漂移是不可重试的集成错误；非 2xx 响应则以 HTTP 状态和 provider
 * 错误码决定重试策略，并把契约问题附加为诊断信息，不能让 HTML/空 5xx 被误判。
 */
export function assertProviderResponseContract(
  manifest: FrozenModelManifest,
  phase: Parameters<typeof assertResponseShape>[1],
  raw: unknown,
  response: Response,
  locale: ProviderErrorLocale,
): void {
  const issues = assertResponseShape(manifest, phase, raw)
  if (issues.length === 0) return
  if (response.ok) throwShapeValidation(issues, locale, raw)

  const info = classifyDashScopeError(withHttpStatus(raw, response.status))
  const diagnostics = shapeDiagnostics(issues)
  throw new DashScopeHttpError({
    ...info,
    details: {
      ...(info.details ?? {}),
      contractValidation: diagnostics,
    },
  }, response.status, { contractValidation: diagnostics, raw })
}

/** SSE 逐条事件的结构断言：缺 id/object/choices 视为契约漂移并阻断。 */
export function assertStreamEvent(
  manifest: FrozenModelManifest,
  event: unknown,
  locale: ProviderErrorLocale,
): void {
  const issues = assertResponseShape(manifest, 'stream-event', event)
  if (issues.length === 0) return
  const diagnostics = shapeDiagnostics(issues)
  throw new DashScopeHttpError({
    category: 'validation',
    retriable: false,
    code: 'RESPONSE_SCHEMA_MISMATCH',
    message: diagnostics.messages[locale],
    details: diagnostics,
  }, undefined, { contractValidation: diagnostics, raw: event })
}

function throwShapeValidation(
  issues: readonly ResponseShapeIssue[],
  locale: ProviderErrorLocale,
  raw: unknown,
): never {
  const diagnostics = shapeDiagnostics(issues)
  throw new DashScopeHttpError({
    category: 'validation',
    retriable: false,
    code: 'RESPONSE_SCHEMA_MISMATCH',
    message: diagnostics.messages[locale],
    details: diagnostics,
  }, undefined, { contractValidation: diagnostics, raw })
}

/** 参数校验失败 → 带请求体路径的本地化诊断（替代 SDK 的 payload schema 路径）。 */
function paramDiagnostics(
  manifest: FrozenModelManifest,
  issues: readonly ParameterValidationIssue[],
): {
  readonly messages: Record<ProviderErrorLocale, string>
  readonly expected: Record<ProviderErrorLocale, string>
  readonly issues: readonly ParameterValidationIssue[]
} {
  const first = issues[0]
  if (first === undefined) {
    return {
      messages: { 'zh-CN': '模型参数校验失败', 'en-US': 'Model parameter validation failed' },
      expected: {
        'zh-CN': '符合模型参数的声明约束',
        'en-US': 'A value conforming to the declared model parameters',
      },
      issues,
    }
  }
  const path = requestPath(manifest, first.field)
  return {
    messages: {
      'zh-CN': `${path}: ${first.messages['zh-CN']}`,
      'en-US': `${path}: ${first.messages['en-US']}`,
    },
    expected: first.expected ?? {
      'zh-CN': '符合模型参数的声明约束',
      'en-US': 'A value conforming to the declared model parameters',
    },
    issues,
  }
}

/** 响应形状失败 → 本地化诊断（issue 消息本身不带语言，双语同一措辞）。 */
function shapeDiagnostics(issues: readonly ResponseShapeIssue[]): {
  readonly messages: Record<ProviderErrorLocale, string>
  readonly issues: readonly ResponseShapeIssue[]
} {
  const first = issues[0]
  const message = first === undefined
    ? '响应形状校验失败 / Response shape validation failed'
    : `${first.path}: ${first.message}`
  return { messages: { 'zh-CN': message, 'en-US': message }, issues }
}

function isRecordDetails(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把参数名映射为请求体中的 JSON pointer 路径：按 binding 落点推导，未绑定的参数
 * 一律归入 /parameters/<name>。保持与 SDK payload schema 相同的路径风格。
 */
function requestPath(manifest: FrozenModelManifest, field: string): string {
  const binding = manifest.request.bindings[field]
  if (binding === undefined) return `/parameters/${field}`
  switch (binding.target) {
    case 'parameters.field':
      return `/parameters/${binding.field ?? field}`
    case 'input.field':
      return `/input/${binding.field}`
    case 'input.prompt':
      return '/input/prompt'
    case 'input.media':
      return '/input/media'
    case 'ui.only':
      return `/parameters/${field}`
  }
}
