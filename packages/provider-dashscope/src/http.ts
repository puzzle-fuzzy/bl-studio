import type { ProviderTransportHeader } from '@bailian-studio/model-core'
import { classifyDashScopeError, type ProviderErrorInfo } from './errors'

/** 可注入的 fetch，供测试、代理与私有网络环境复用。 */
export type DashScopeFetch = typeof fetch

export class DashScopeHttpError extends Error {
  constructor(
    public readonly info: ProviderErrorInfo,
    public readonly status?: number,
    public readonly raw?: unknown,
  ) {
    super(info.message)
    this.name = 'DashScopeHttpError'
  }
}

export type DashScopeResponseValidator = (raw: unknown, response: Response) => void

export async function requestJson(
  fetchImpl: DashScopeFetch,
  url: string,
  init: RequestInit,
  validateResponse?: DashScopeResponseValidator,
  timeoutMs = 60_000,
): Promise<unknown> {
  let response: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DashScopeHttpError(
        { category: 'timeout', retriable: true, code: 'PROVIDER_REQUEST_TIMEOUT', message: `Provider request timed out after ${timeoutMs}ms` },
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
  finally {
    clearTimeout(timeout)
  }

  const raw = await readResponseBody(response)
  validateResponse?.(raw, response)
  if (!response.ok) {
    throw new DashScopeHttpError(classifyDashScopeError(withHttpStatus(raw, response.status)), response.status, raw)
  }
  return raw
}

/**
 * 请求头来自 manifest.transport 的声明（ProviderTransportHeader[]）。无固定值的
 * Authorization 由运行时 API Key 注入；任何新的无值请求头都会提前失败，避免升级后
 * 漏传安全相关字段。
 */
export function createManifestHeaders(
  apiKey: string,
  declarations: readonly ProviderTransportHeader[],
): Headers {
  const headers = new Headers()
  for (const declaration of declarations) {
    if (declaration.name.toLowerCase() === 'authorization') {
      headers.set(declaration.name, `Bearer ${apiKey}`)
      continue
    }
    if (declaration.value !== undefined) {
      headers.set(declaration.name, declaration.value)
      continue
    }
    throw new DashScopeHttpError({
      category: 'validation',
      retriable: false,
      code: 'DASHSCOPE_REQUIRED_HEADER_UNRESOLVED',
      message: `DashScope manifest requires unresolved header: ${declaration.name}`,
      details: { header: declaration.name },
    })
  }
  return headers
}

export function getStringPath(value: unknown, path: string): string | undefined {
  const result = path.split('.').reduce<unknown>((current, segment) => getProperty(current, segment), value)
  return typeof result === 'string' ? result : undefined
}

export async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json()
  } catch {
    try {
      return await response.text()
    } catch {
      return undefined
    }
  }
}

function getProperty(value: unknown, property: string): unknown {
  if (typeof value !== 'object' || value === null || !(property in value)) return undefined
  return (value as Record<string, unknown>)[property]
}

export function withHttpStatus(raw: unknown, status: number): unknown {
  if (typeof raw === 'object' && raw !== null) return { ...raw, status }
  if (typeof raw === 'string' && raw.trim().length > 0) return { message: raw, status }
  return { status }
}
