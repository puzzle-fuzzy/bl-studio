import {
  BailianStudioBailianAdapterError,
  validateBailianHttpRequest,
  validateBailianResponse,
} from '@bailian-studio/bailian-adapter'
import { classifyDashScopeError } from './errors'
import { DashScopeHttpError, withHttpStatus } from './http'

export type BailianContractLocale = 'zh-CN' | 'en-US'

export function resolveAdapterTarget<T>(resolve: () => T): T {
  try {
    return resolve()
  } catch (error) {
    if (error instanceof BailianStudioBailianAdapterError) {
      throw new DashScopeHttpError({
        category: 'validation',
        retriable: false,
        code: `BAILIAN_ADAPTER_${error.code}`,
        message: error.message,
        details: error.toJSON(),
      }, undefined, error.toJSON())
    }
    throw error
  }
}

export function assertProviderContract(
  result: ReturnType<typeof validateBailianResponse> | ReturnType<typeof validateBailianHttpRequest>,
  locale: BailianContractLocale,
  raw: unknown,
): void {
  if (result.valid) return
  throwContractValidation(result, locale, raw)
}

/**
 * 成功响应的契约漂移是不可重试的集成错误；非 2xx 响应则以 HTTP 状态和 provider
 * 错误码决定重试策略，并把契约问题附加为诊断信息，不能让 HTML/空 5xx 被误判。
 */
export function assertProviderResponseContract(
  result: ReturnType<typeof validateBailianResponse>,
  locale: BailianContractLocale,
  raw: unknown,
  response: Response,
): void {
  if (result.valid) return
  if (response.ok) throwContractValidation(result, locale, raw)

  const info = classifyDashScopeError(withHttpStatus(raw, response.status))
  const diagnostics = contractDiagnostics(result)
  throw new DashScopeHttpError({
    ...info,
    details: {
      ...(info.details ?? {}),
      contractValidation: diagnostics,
    },
  }, response.status, { contractValidation: result, raw })
}

function throwContractValidation(
  result: ReturnType<typeof validateBailianResponse> | ReturnType<typeof validateBailianHttpRequest>,
  locale: BailianContractLocale,
  raw: unknown,
): never {
  const first = result.issues[0]
  const diagnostics = contractDiagnostics(result)
  throw new DashScopeHttpError({
    category: 'validation',
    retriable: false,
    code: first === undefined ? 'BAILIAN_CONTRACT_INVALID' : `BAILIAN_CONTRACT_${first.code}`,
    message: diagnostics.messages[locale],
    details: diagnostics,
  }, undefined, { contractValidation: result, raw })
}

function contractDiagnostics(
  result: ReturnType<typeof validateBailianResponse> | ReturnType<typeof validateBailianHttpRequest>,
): {
  readonly messages: Record<BailianContractLocale, string>
  readonly expected: unknown
  readonly issues: typeof result.issues
} {
  const first = result.issues[0]
  const messages = first === undefined
    ? {
        'zh-CN': '百炼 Contract v3 校验失败',
        'en-US': 'Bailian Contract v3 validation failed',
      }
    : {
        'zh-CN': `${first.path}: ${first.message['zh-CN']}`,
        'en-US': `${first.path}: ${first.message['en-US']}`,
      }
  return { messages, expected: first?.expected, issues: result.issues }
}
