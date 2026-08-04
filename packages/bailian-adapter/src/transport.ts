import type { ResolvedModelOperation, SupportedLocale } from '@puzzle-fuzzy/bailian-sdk'
import { requireBailianSdkOperation } from './coverage'
import { BailianStudioBailianAdapterError } from './errors'

export interface BailianEndpointOptions {
  readonly workspaceId?: string
}

export interface ResolvedBailianHttpTarget {
  readonly method: string
  readonly url: string
  readonly headers: ResolvedModelOperation['transport']['request']['headers']
}

export type BailianTaskLifecycle = 'pending' | 'succeeded' | 'failed'

export function resolveBailianSubmitTarget(
  consumerId: string,
  options: BailianEndpointOptions = {},
  locale: SupportedLocale = 'zh-CN',
): ResolvedBailianHttpTarget {
  const operation = requireBailianSdkOperation(consumerId, locale)
  return {
    method: operation.transport.request.method,
    url: resolveEndpoint(operation.transport.request.endpointTemplate, options, locale),
    headers: operation.transport.request.headers,
  }
}

export function resolveBailianPollTarget(
  consumerId: string,
  taskId: string,
  options: BailianEndpointOptions = {},
  locale: SupportedLocale = 'zh-CN',
): ResolvedBailianHttpTarget {
  if (taskId.trim().length === 0) {
    throw new BailianStudioBailianAdapterError(
      'TASK_ID_REQUIRED',
      {
        'zh-CN': '轮询百炼任务时必须提供 taskId',
        'en-US': 'taskId is required when polling a Bailian task',
      },
      locale,
    )
  }

  const polling = requirePollingTransport(consumerId, locale)
  return {
    method: polling.method,
    url: resolveEndpoint(polling.endpointTemplate, { ...options, taskId }, locale),
    headers: polling.headers,
  }
}

/**
 * Resolve the generic DashScope async-task cancellation endpoint. DashScope
 * exposes cancellation beside the task polling endpoint rather than as a
 * model-specific SDK operation, so it still uses the adapter-owned trusted
 * polling target as its base.
 */
export function resolveBailianCancelTarget(
  consumerId: string,
  taskId: string,
  options: BailianEndpointOptions = {},
  locale: SupportedLocale = 'zh-CN',
): ResolvedBailianHttpTarget {
  const polling = resolveBailianPollTarget(consumerId, taskId, options, locale)
  return {
    method: 'POST',
    url: `${polling.url.replace(/\/$/, '')}/cancel`,
    headers: polling.headers,
  }
}

/**
 * 使用 SDK transport 中声明的终态集合判断任务状态。响应会先通过 Contract v3，
 * 因此不在成功/失败集合中的合法状态就是等待态。
 */
export function classifyBailianTaskStatus(
  consumerId: string,
  providerStatus: string,
  locale: SupportedLocale = 'zh-CN',
): BailianTaskLifecycle {
  const polling = requirePollingTransport(consumerId, locale)
  const normalized = providerStatus.toUpperCase()
  if (polling.succeededValues.some((value) => value.toUpperCase() === normalized)) return 'succeeded'
  if (polling.failedValues.some((value) => value.toUpperCase() === normalized)) return 'failed'
  return 'pending'
}

function requirePollingTransport(
  consumerId: string,
  locale: SupportedLocale,
): Extract<ResolvedModelOperation['transport'], { polling: unknown }>['polling'] {
  const operation = requireBailianSdkOperation(consumerId, locale)
  const polling = 'polling' in operation.transport ? operation.transport.polling : undefined
  if (polling === undefined) {
    throw new BailianStudioBailianAdapterError(
      'POLLING_NOT_SUPPORTED',
      {
        'zh-CN': `业务模型 ${consumerId} 不支持异步轮询`,
        'en-US': `Consumer model ${consumerId} does not support asynchronous polling`,
      },
      locale,
      { consumerId },
    )
  }
  return polling
}

function resolveEndpoint(
  template: string,
  options: BailianEndpointOptions & { readonly taskId?: string },
  locale: SupportedLocale,
): string {
  let endpoint = template
  if (endpoint.includes('{WorkspaceId}')) {
    if (options.workspaceId === undefined || options.workspaceId.length === 0) {
      throw new BailianStudioBailianAdapterError(
        'WORKSPACE_ID_REQUIRED',
        {
          'zh-CN': '该百炼模型使用独立工作空间端点，必须配置 workspaceId',
          'en-US': 'This Bailian model uses a workspace endpoint; workspaceId is required',
        },
        locale,
        { endpointTemplate: template },
      )
    }
    if (!isValidBailianWorkspaceId(options.workspaceId)) {
      throw new BailianStudioBailianAdapterError(
        'WORKSPACE_ID_INVALID',
        {
          'zh-CN': 'workspaceId 只能包含英文字母、数字、连字符和下划线',
          'en-US': 'workspaceId may contain only letters, digits, hyphens, and underscores',
        },
        locale,
        { workspaceId: options.workspaceId },
      )
    }
    endpoint = endpoint.replaceAll('{WorkspaceId}', options.workspaceId)
  }

  if (options.taskId !== undefined) {
    endpoint = endpoint.replaceAll('{taskId}', encodeURIComponent(options.taskId))
  }

  const unresolved = endpoint.match(/\{[^}]+\}/)?.[0]
  if (unresolved !== undefined) {
    throw new BailianStudioBailianAdapterError(
      'UNRESOLVED_ENDPOINT_PLACEHOLDER',
      {
        'zh-CN': `百炼端点仍有未解析占位符 ${unresolved}`,
        'en-US': `Bailian endpoint still contains unresolved placeholder ${unresolved}`,
      },
      locale,
      { endpointTemplate: template, unresolved },
    )
  }

  assertTrustedBailianEndpoint(endpoint, locale)
  return endpoint
}

export function isValidBailianWorkspaceId(workspaceId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(workspaceId)
}

/** 防止 SDK transport 漂移把 API Key 或请求数据发送到非阿里云百炼端点。 */
export function assertTrustedBailianEndpoint(
  endpoint: string,
  locale: SupportedLocale = 'zh-CN',
): void {
  let parsed: URL | undefined
  try {
    parsed = new URL(endpoint)
  } catch {
    parsed = undefined
  }

  const hostname = parsed?.hostname.toLowerCase()
  const workspaceHost = hostname?.endsWith('.cn-beijing.maas.aliyuncs.com') === true
  const trustedHost = hostname === 'dashscope.aliyuncs.com' || workspaceHost
  const trustedPath = parsed?.pathname.startsWith('/api/v1/') === true
    || (workspaceHost && parsed?.pathname.startsWith('/compatible-mode/v1/') === true)
  const trusted = parsed !== undefined
    && parsed.protocol === 'https:'
    && parsed.username === ''
    && parsed.password === ''
    && parsed.port === ''
    && trustedHost
    && trustedPath

  if (trusted) return
  throw new BailianStudioBailianAdapterError(
    'UNTRUSTED_ENDPOINT',
    {
      'zh-CN': '百炼 SDK 返回了不受信任的请求端点，已阻止发送凭据和请求数据',
      'en-US': 'Bailian SDK returned an untrusted endpoint; credentials and request data were not sent',
    },
    locale,
    { endpoint },
  )
}
