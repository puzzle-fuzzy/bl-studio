/**
 * DashScope 传输目标解析（纯函数，无 HTTP 副作用）。
 *
 * manifest.transport 直接声明提交/轮询端点的 URL 模板与请求头，这里负责把模板解析成
 * 实际 URL：替换 {WorkspaceId}（工作空间专属端点必需 BAILIAN_WORKSPACE_ID）与
 * {taskId}（轮询路径内嵌任务 ID），并断言端点落在受信主机上。manifest 是唯一
 * 数据源，端点解析从已删除的 bailian-adapter 移植到了这里。
 *
 * 取消端点由轮询模板推导：DashScope 全部异步任务共用通用的
 * `GET /api/v1/tasks/{taskId}` 轮询 + `POST /api/v1/tasks/{taskId}/cancel` 取消
 * （manifest 的 polling.endpointTemplate 均以 /tasks/{taskId} 结尾）。
 */
import type {
  FrozenModelManifest,
  ProviderTransportHeader,
} from '@bailian-studio/model-core'
import { ModelCoreError } from '@bailian-studio/model-core'

/** 深只读的 async transport polling 段（manifest 冻结后形态）。 */
type FrozenPollingTransport = Extract<FrozenModelManifest['transport'], { mode: 'provider_async' }>['polling']

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const TRUSTED_HOST_SUFFIXES = ['dashscope.aliyuncs.com', '.cn-beijing.maas.aliyuncs.com']
const ALLOWED_PATH_PREFIXES = ['/api/v1/', '/compatible-mode/v1/']

export interface DashScopeTransportOptions {
  workspaceId?: string
}

export interface DashScopeHttpTarget {
  method: string
  url: string
  headers: readonly ProviderTransportHeader[]
}

export function isValidDashScopeWorkspaceId(workspaceId: string): boolean {
  return WORKSPACE_ID_PATTERN.test(workspaceId)
}

export function resolveDashScopeSubmitTarget(
  manifest: FrozenModelManifest,
  options: DashScopeTransportOptions,
): DashScopeHttpTarget {
  const url = resolveTemplate(manifest.transport.submit.endpointTemplate, options.workspaceId, {})
  assertTrustedDashScopeEndpoint(url, 'submit')
  return {
    method: manifest.transport.submit.method,
    url,
    headers: manifest.transport.submit.headers,
  }
}

export function resolveDashScopePollTarget(
  manifest: FrozenModelManifest,
  providerTaskId: string,
  options: DashScopeTransportOptions,
): DashScopeHttpTarget {
  const polling = pollingTransport(manifest, 'poll')
  requireTaskId(providerTaskId)
  const url = resolveTemplate(polling.endpointTemplate, options.workspaceId, { taskId: providerTaskId })
  assertTrustedDashScopeEndpoint(url, 'poll')
  return { method: polling.method, url, headers: polling.headers }
}

export function resolveDashScopeCancelTarget(
  manifest: FrozenModelManifest,
  providerTaskId: string,
  options: DashScopeTransportOptions,
): DashScopeHttpTarget {
  const polling = pollingTransport(manifest, 'cancel')
  requireTaskId(providerTaskId)
  // 通用异步任务取消端点 = 轮询模板 + /cancel（所有 async manifest 的轮询模板均以
  // /tasks/{taskId} 结尾，见文件头注释）。
  const url = `${resolveTemplate(polling.endpointTemplate, options.workspaceId, { taskId: providerTaskId })}/cancel`
  assertTrustedDashScopeEndpoint(url, 'cancel')
  return {
    method: 'POST',
    url,
    headers: [
      { name: 'Authorization' },
      { name: 'Content-Type', value: 'application/json' },
    ],
  }
}

function pollingTransport(manifest: FrozenModelManifest, purpose: 'poll' | 'cancel'): FrozenPollingTransport {
  if (manifest.transport.mode !== 'provider_async' || manifest.transport.polling === undefined) {
    throw new ModelCoreError(
      'ASYNC_POLLING_UNSUPPORTED',
      `DashScope model ${manifest.id} 不支持 ${purpose}（非异步任务模型） / DashScope model ${manifest.id} does not support ${purpose} (not an async task model)`,
    )
  }
  return manifest.transport.polling
}

function requireTaskId(providerTaskId: string): void {
  if (providerTaskId === undefined || providerTaskId.length === 0) {
    throw new ModelCoreError(
      'TASK_ID_REQUIRED',
      '任务 ID 不能为空 / Provider task id is required',
    )
  }
}

/** 把端点模板中的 {WorkspaceId} / {taskId} 占位符替换为实际值。 */
function resolveTemplate(template: string, workspaceId: string | undefined, vars: { taskId?: string }): string {
  let url = template
  if (template.includes('{WorkspaceId}')) {
    if (workspaceId === undefined || workspaceId.length === 0) {
      throw new ModelCoreError(
        'WORKSPACE_ID_REQUIRED',
        `模型端点需要 BAILIAN_WORKSPACE_ID / DashScope ${'{}'} endpoint requires a workspace id`,
      )
    }
    if (!isValidDashScopeWorkspaceId(workspaceId)) {
      throw new ModelCoreError(
        'WORKSPACE_ID_INVALID',
        `BAILIAN_WORKSPACE_ID 只能包含英文字母、数字、连字符和下划线 / BAILIAN_WORKSPACE_ID may contain only letters, digits, hyphens, and underscores`,
      )
    }
    url = url.replace('{WorkspaceId}', workspaceId)
  }
  if (vars.taskId !== undefined) {
    url = url.replace('{taskId}', encodeURIComponent(vars.taskId))
  }
  return url
}

/** 端点必须落在受信主机：https、无凭据、官方域、版本前缀路径。 */
function assertTrustedDashScopeEndpoint(url: string, purpose: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ModelCoreError(
      'UNRESOLVED_ENDPOINT_PLACEHOLDER',
      `DashScope ${purpose} 端点模板无法解析：${url} / DashScope ${purpose} endpoint template failed to resolve: ${url}`,
    )
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username.length > 0
    || parsed.password.length > 0
    || !TRUSTED_HOST_SUFFIXES.some(suffix => parsed.host === suffix || parsed.host.endsWith(suffix))
    || !ALLOWED_PATH_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix))
  ) {
    throw new ModelCoreError(
      'UNTRUSTED_ENDPOINT',
      `DashScope ${purpose} 端点不在受信主机：${url} / DashScope ${purpose} endpoint is not trusted: ${url}`,
    )
  }
}
