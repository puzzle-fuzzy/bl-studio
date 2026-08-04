/**
 * Provider Runner Interface
 * Abstracts different AI provider implementations behind a unified interface
 *
 * Type strategy: reuse domain types directly (TaskErrorCategory, NormalizedOutput)
 * so the provider layer composes with task-engine and generation-repository
 * without unsafe casts.
 */

import type { FrozenModelManifest } from '@bailian-studio/model-core'
import type { NormalizedOutput } from '@bailian-studio/provider-dashscope'
import type { TaskErrorCategory } from '@bailian-studio/task-engine'

/**
 * Input parameters for provider execution
 */
export interface ProviderExecuteInput {
  readonly manifest: FrozenModelManifest
  readonly inputParams: Record<string, unknown>
  readonly taskId: string
  /** Cost reserved with the durable generation record; reused across submit and poll. */
  readonly estimatedCostCents: number
  readonly providerTaskId?: string
  /** Stable identity for a submit/chat operation; omitted for polls. */
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
 * Provider error information.
 * Reuses TaskErrorCategory so this composes directly into TaskError.
 */
export interface ProviderError {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly category: TaskErrorCategory
  readonly details?: Readonly<Record<string, unknown>>
}

export type ProviderCancelOutput =
  | { readonly status: 'cancelled'; readonly requestId?: string }
  | { readonly status: 'unsupported'; readonly requestId?: string; readonly reason: string }
  | { readonly status: 'failed'; readonly requestId?: string; readonly error: ProviderError }

/**
 * Provider Runner interface.
 * All provider implementations must implement this interface.
 */
export interface ProviderRunner {
  /** Execute a generation task. */
  execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput>

  /** Best-effort cancellation after an async provider task has been submitted. */
  cancel?(input: ProviderCancelInput): Promise<ProviderCancelOutput>

  /** Whether this runner can handle the given manifest. */
  supports(manifest: FrozenModelManifest): boolean

  /** Provider identifier this runner owns (e.g. 'dashscope'). */
  readonly providerId: string
}

/**
 * Build a ProviderError from a code/message/category triple.
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
