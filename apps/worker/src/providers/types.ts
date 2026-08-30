/**
 * Provider Runner 接口
 * 用统一接口抽象不同的 AI provider 实现
 *
 * 类型策略：直接复用领域类型（TaskErrorCategory、NormalizedOutput），
 * 让 provider 层无需不安全的类型断言即可与 task-engine、generation-repository 组合。
 */

import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import type { NormalizedOutput } from '@bailian-studio/provider-dashscope'
import type { TaskErrorCategory } from '@bailian-studio/task-engine'

/**
 * provider 执行的输入参数
 */
export interface ProviderExecuteInput {
  readonly manifest: FrozenModelManifest
  readonly inputParams: Record<string, unknown>
  readonly taskId: string
  /** 随持久化 generation 记录预留的费用；在 submit 与 poll 之间复用。 */
  readonly estimatedCostCents: number
  readonly providerTaskId?: string
  /** submit/chat 操作的稳定标识；poll 时省略。 */
  readonly idempotencyKey?: string
}

export interface ProviderCancelInput {
  readonly manifest: FrozenModelManifest
  readonly providerTaskId: string
}

interface ProviderExecuteMetadata {
  readonly costCents: number
  readonly providerTaskId?: string
  readonly providerStatus?: string
  readonly nextPollAt?: string
  readonly requestId?: string
  readonly raw?: unknown
}

/** Provider 输出使用判别联合，类型层直接排除“成功但无结果/轮询 ID”等非法状态。 */
export type ProviderExecuteOutput =
  | ProviderCompletedOutput
  | ProviderPollingOutput
  | ProviderFailedOutput

export interface ProviderCompletedOutput extends ProviderExecuteMetadata {
  readonly success: true
  readonly requiresPoll: false
  readonly output: NormalizedOutput
  readonly error?: never
}

export interface ProviderPollingOutput extends ProviderExecuteMetadata {
  readonly success: true
  readonly requiresPoll: true
  readonly providerTaskId: string
  readonly output?: never
  readonly error?: never
}

export interface ProviderFailedOutput extends ProviderExecuteMetadata {
  readonly success: false
  readonly requiresPoll: false
  readonly error: ProviderError
  readonly output?: never
}

/**
 * Provider 错误信息。
 * 复用 TaskErrorCategory，使该类型可直接组合进 TaskError。
 */
export interface ProviderError {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly category: TaskErrorCategory
  readonly details?: Readonly<Record<string, unknown>>
}

/** provider 抛异常时供 worker 状态机消费的统一分类结果。 */
export interface ProviderErrorClassification {
  readonly category: TaskErrorCategory
  readonly retriable: boolean
  readonly code?: string
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type ProviderCancelOutput =
  | { readonly status: 'cancelled'; readonly requestId?: string }
  | { readonly status: 'unsupported'; readonly requestId?: string; readonly reason: string }
  | { readonly status: 'failed'; readonly requestId?: string; readonly error: ProviderError }

/**
 * Provider Runner 接口。
 * 所有 provider 实现都必须实现该接口。
 */
export interface ProviderRunner {
  /** 执行一个 generation task。 */
  execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput>

  /** 异步 provider task 提交后的尽力取消。 */
  cancel?(input: ProviderCancelInput): Promise<ProviderCancelOutput>

  /**
   * 将 runner 未能自行收敛的异常转换为统一分类。
   * provider-specific 分类逻辑由具体 runner 持有，worker 编排层不感知其类型。
   */
  classifyError?(error: unknown): ProviderErrorClassification

  /** 该 runner 是否能处理给定的 manifest。 */
  supports(manifest: FrozenModelManifest): boolean

  /** 该 runner 所属的 provider 标识（例如 'dashscope'）。 */
  readonly providerId: string
}

/**
 * 由 code/message/category 三元组构建 ProviderError。
 */
export function providerError(
  code: string,
  message: string,
  category: TaskErrorCategory,
  retryable: boolean,
  details?: Readonly<Record<string, unknown>>,
): ProviderError {
  return {
    code,
    message,
    retryable,
    category,
    ...(details !== undefined ? { details } : {}),
  }
}
