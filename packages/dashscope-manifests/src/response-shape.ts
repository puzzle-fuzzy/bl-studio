/**
 * 响应形状断言（纯函数）。
 *
 * 替代已删除的 SDK Ajv responseContracts 校验：由 manifest.transport（taskId/status
 * 路径与终态集合）+ output 映射推导"关键字段"，对 DashScope 统一的异步任务信封与
 * OpenAI 兼容 chat 块做结构性校验。天然 lenient——接受一切未知字段，只在缺关键字段
 * 或状态无法识别时报告问题。
 *
 * assertResponseShape 返回问题列表（空 = 通过），由调用方决定是否阻断：
 *  - submit / poll / final / stream-event：关键字段缺失 → 阻断（不可重试的集成错误）；
 *  - error 阶段（非 2xx）完全宽容，交由错误分类，不在此拦截。
 */
import type { ProviderOutputMapping } from './contracts'
import type { FrozenModelManifest } from './types'

export type ResponsePhase = 'submit' | 'poll' | 'final' | 'error' | 'stream-event'

export interface ResponseShapeIssue {
  readonly path: string
  readonly message: string
}

/**
 * DashScope 异步任务的非终态集合。全部 async manifest 一致声明
 * succeeded=['SUCCEEDED'] / failed=['FAILED','CANCELED','UNKNOWN']（源契约枚举值
 * 也仅这六种），剩余可识别等待态即 PENDING / RUNNING。未知状态一律视为契约漂移。
 */
const KNOWN_PENDING_STATUSES = ['PENDING', 'RUNNING'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 JSON-pointer（'/output/task_id'）或点路径（'output.task_id'）。两类都支持，
 * 因为迁移后的 manifest transport 沿用 SDK 的 JSON-pointer 格式，而历史调用点用点路径。
 */
function pathSegments(path: string): string[] {
  return path.replace(/^\//, '').split(/[./]/).filter(segment => segment.length > 0)
}

function pointerValue(root: unknown, path: string): unknown {
  let value: unknown = root
  for (const part of pathSegments(path)) {
    if (Array.isArray(value)) {
      const index = Number(part)
      if (!Number.isInteger(index) || index < 0 || index >= value.length) return undefined
      value = value[index]
      continue
    }
    if (!isRecord(value) || !(part in value)) return undefined
    value = value[part]
  }
  return value
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** output 映射能推导出的"最终产物必须存在"的关键路径；无法推导的返回空列表。 */
function artifactRequiredPaths(mapping: ProviderOutputMapping): string[] {
  switch (mapping.kind) {
    case 'video-url':
    case 'audio-url':
    case 'text':
      return [mapping.path]
    case 'images-from-message-content':
      return ['output.choices']
    case 'asr-transcription':
    case 'custom':
      return []
  }
}

export function assertResponseShape(
  manifest: FrozenModelManifest,
  phase: ResponsePhase,
  response: unknown,
): ResponseShapeIssue[] {
  // 非 2xx 错误响应：record 完全宽容（交由错误分类，不在此拦截）；非 record（HTML、
  // 空响应、JSON 数组等）报告一条形状问题，由调用方附为 contractValidation 诊断，
  // 避免把畸形 5xx 误判为合法错误体。
  if (phase === 'error') {
    return isRecord(response)
      ? []
      : [{ path: '/', message: 'Error response must be a JSON object' }]
  }
  if (!isRecord(response)) {
    return [{ path: '/', message: 'Response must be a JSON object' }]
  }

  const issues: ResponseShapeIssue[] = []
  const asyncPolling = manifest.transport.mode === 'provider_async'
    ? manifest.transport.polling
    : undefined

  if (phase === 'stream-event') {
    // OpenAI 兼容 chat 块信封：id / object / choices 为逐条事件的关键元数据。
    if (!nonEmptyString(response.id)) {
      issues.push({ path: '/id', message: 'Stream event must include a non-empty id' })
    }
    if (!nonEmptyString(response.object)) {
      issues.push({ path: '/object', message: 'Stream event must include an object kind' })
    }
    if (!Array.isArray(response.choices)) {
      issues.push({ path: '/choices', message: 'Stream event must include a choices array' })
    }
    return issues
  }

  // DashScope 异步任务信封统一带 request_id。
  if (asyncPolling !== undefined && (phase === 'submit' || phase === 'poll' || phase === 'final')) {
    if (!nonEmptyString(response.request_id)) {
      issues.push({ path: '/request_id', message: 'DashScope response must include a non-empty request_id' })
    }
  }

  if (phase === 'submit') {
    if (asyncPolling !== undefined) {
      const taskId = pointerValue(response, asyncPolling.taskIdPath)
      if (!nonEmptyString(taskId)) {
        issues.push({ path: asyncPolling.taskIdPath, message: 'Async submit response must include a task id' })
      }
    }
    return issues
  }

  if (phase === 'poll') {
    if (asyncPolling !== undefined) {
      const status = pointerValue(response, asyncPolling.statusPath)
      if (!nonEmptyString(status)) {
        issues.push({ path: asyncPolling.statusPath, message: 'Polling response must include a task status' })
      } else {
        const recognized = asyncPolling.succeededValues.some(value => value.toUpperCase() === status.toUpperCase())
          || asyncPolling.failedValues.some(value => value.toUpperCase() === status.toUpperCase())
          || KNOWN_PENDING_STATUSES.some(value => value.toUpperCase() === status.toUpperCase())
        if (!recognized) {
          issues.push({ path: asyncPolling.statusPath, message: `Unrecognized task status: ${status}` })
        }
      }
    }
    return issues
  }

  if (phase === 'final') {
    if (asyncPolling !== undefined) {
      const status = pointerValue(response, asyncPolling.statusPath)
      if (!nonEmptyString(status)) {
        issues.push({ path: asyncPolling.statusPath, message: 'Final response must include a task status' })
      } else if (!asyncPolling.succeededValues.some(value => value.toUpperCase() === status.toUpperCase())) {
        issues.push({ path: asyncPolling.statusPath, message: `Final response status ${status} is not a succeeded state` })
      }
    }
    for (const path of artifactRequiredPaths(manifest.output)) {
      const value = pointerValue(response, path)
      if (path === 'output.choices') {
        if (!Array.isArray(value) || value.length === 0) {
          issues.push({ path, message: 'Final response must include a non-empty output.choices array' })
        }
      } else if (!nonEmptyString(value)) {
        issues.push({ path, message: `Final response must include ${path}` })
      }
    }
    return issues
  }

  return issues
}
