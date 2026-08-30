/**
 * DashScope Provider Runner
 * 为阿里云 DashScope（Bailian / 百炼）provider 实现 ProviderRunner。
 *
 * 类型策略：直接消费 provider-dashscope 的判别联合，并复用 model-core 的校验，
 * 因此无需任何不安全的类型断言。
 */

import {
  ModelCoreError,
  calculateUsageCostCents,
  calculateUsagePriceCents,
  validateModelParams,
} from '@bailian-studio/model-core'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import {
  createDashScopeClient,
  DashScopeHttpError,
  type CreateDashScopeClientOptions,
} from '@bailian-studio/provider-dashscope'
import type {
  ProviderCancelInput,
  ProviderCancelOutput,
  ProviderExecuteInput,
  ProviderExecuteOutput,
  ProviderRunner,
} from './types'

export interface CreateDashScopeRunnerOptions {
  apiKey: string
  workspaceId?: string
  errorLocale?: 'zh-CN' | 'en-US'
  fetch?: CreateDashScopeClientOptions['fetch']
  requestTimeoutMs?: number
}

export class DashScopeProviderRunner implements ProviderRunner {
  readonly providerId = 'dashscope'
  private readonly client

  constructor(options: CreateDashScopeRunnerOptions) {
    this.client = createDashScopeClient({
      apiKey: options.apiKey,
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      ...(options.errorLocale !== undefined ? { errorLocale: options.errorLocale } : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    })
  }

  supports(manifest: FrozenModelManifest): boolean {
    return manifest.provider === this.providerId
  }

  async execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    const { manifest, inputParams, providerTaskId, idempotencyKey, estimatedCostCents } = input

    // 轮询只需要 provider task 标识。submit 专用的媒体 URL 故意不持久化，
    // 因此在这里校验原始 submit manifest 会错误地拒绝合法的异步续跑。
    if (providerTaskId !== undefined) {
      try {
        return await this.poll(manifest, inputParams, providerTaskId, estimatedCostCents)
      } catch (error) {
        return this.toProviderFailure(error)
      }
    }

    // 复用 model-core 的参数校验（默认值、取值范围、选项）。
    const validation = validateModelParams(manifest, inputParams)
    if (!validation.valid) {
      const first = validation.errors[0]
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        error: {
          code: 'PROVIDER_VALIDATION_ERROR',
          message: first ? `${first.field}: ${first.message}` : 'Invalid parameters',
          retryable: false,
          category: 'validation',
          details: { issues: validation.errors },
        },
      }
    }

    try {
      const costCents = estimatedCostCents
      if (manifest.taskMode === 'stream') {
        return await this.runChat(manifest, validation.params, costCents)
      }
      return await this.submit(manifest, validation.params, costCents, idempotencyKey)
    } catch (error) {
      return this.toProviderFailure(error)
    }
  }

  async cancel(input: ProviderCancelInput): Promise<ProviderCancelOutput> {
    try {
      const result = await this.client.cancel({
        manifest: input.manifest,
        providerTaskId: input.providerTaskId,
      })
      if (result.mode === 'unsupported') {
        return {
          status: 'unsupported',
          reason: result.reason,
          ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
        }
      }
      return {
        status: 'cancelled',
        ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
      }
    } catch (error) {
      const failure = this.toProviderFailure(error)
      if (failure.success) {
        return {
          status: 'failed',
          error: {
            code: 'PROVIDER_CANCEL_UNEXPECTED_SUCCESS',
            message: 'Provider cancellation failed to produce a failure result',
            retryable: false,
            category: 'provider',
          },
        }
      }
      return { status: 'failed', error: failure.error }
    }
  }

  private async submit(
    manifest: FrozenModelManifest,
    params: Record<string, unknown>,
    costCents: number,
    idempotencyKey: string | undefined,
  ): Promise<ProviderExecuteOutput> {
    const result = await this.client.submit({
      manifest,
      params,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    })

    if (result.mode === 'completed') {
      const finalCostCents = completedProviderCost(manifest, params, result.output.usage, costCents)
      return {
        success: true,
        output: result.output,
        costCents: finalCostCents,
        requiresPoll: false,
        requestId: result.requestId,
        ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
        raw: result.raw,
      }
    }

    // mode === 'polling'
    return {
      success: true,
      costCents,
      requiresPoll: true,
      providerTaskId: result.providerTaskId,
      requestId: result.requestId,
      ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
      ...(result.nextPollAt !== undefined ? { nextPollAt: result.nextPollAt } : {}),
      raw: result.raw,
    }
  }

  private async poll(
    manifest: FrozenModelManifest,
    params: Readonly<Record<string, unknown>>,
    providerTaskId: string,
    costCents: number,
  ): Promise<ProviderExecuteOutput> {
    const result = await this.client.poll({ manifest, providerTaskId })

    if (result.mode === 'pending') {
      return {
        success: true,
        costCents,
        requiresPoll: true,
        providerTaskId,
        requestId: result.requestId,
        ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
        ...(result.nextPollAt !== undefined ? { nextPollAt: result.nextPollAt } : {}),
        raw: result.raw,
      }
    }

    if (result.mode === 'failed') {
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        providerTaskId,
        requestId: result.requestId,
        ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
        error: {
          code: result.error.code ?? 'PROVIDER_TASK_FAILED',
          message: result.error.message,
          retryable: result.error.retriable,
          category: result.error.category,
          ...(result.error.details !== undefined ? { details: result.error.details } : {}),
        },
        raw: result.raw,
      }
    }

    // mode === 'completed'
    const finalCostCents = completedProviderCost(manifest, params, result.output.usage, costCents)
    return {
      success: true,
      output: result.output,
      costCents: finalCostCents,
      requiresPoll: false,
      providerTaskId,
      requestId: result.requestId,
      ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
      raw: result.raw,
    }
  }

  private async runChat(
    manifest: FrozenModelManifest,
    params: Record<string, unknown>,
    costCents: number,
  ): Promise<ProviderExecuteOutput> {
    const result = await this.client.chat({ manifest, params })

    if (result.mode === 'failed') {
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        requestId: result.requestId,
        error: {
          code: result.error.code ?? 'PROVIDER_CHAT_FAILED',
          message: result.error.message,
          retryable: result.error.retriable,
          category: result.error.category,
          ...(result.error.details !== undefined ? { details: result.error.details } : {}),
        },
      }
    }

    // 从 usage 计算实际费用
    const usage = result.output.usage as
      | {
          promptTokens?: number
          completionTokens?: number
          promptTokensDetails?: { textTokens?: number; audioTokens?: number }
          completionTokensDetails?: { textTokens?: number }
        }
      | undefined
    const actualCostCents = usage !== undefined
      ? (calculateUsagePriceCents(manifest, usage) ?? costCents)
      : costCents

    return {
      success: true,
      output: result.output,
      costCents: actualCostCents,
      requiresPoll: false,
      requestId: result.requestId,
      raw: result.output.raw,
    }
  }

  /**
   * 把抛出的错误转换为不抛异常的 ProviderExecuteOutput。
   * DashScopeHttpError 携带已分类的 ProviderErrorInfo；其余错误一律视为不透明的 provider 错误。
   */
  private toProviderFailure(error: unknown): ProviderExecuteOutput {
    if (error instanceof DashScopeHttpError) {
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        error: {
          code: error.info.code ?? providerHttpCode(error.status),
          message: error.info.message,
          retryable: error.info.retriable,
          category: error.info.category,
          ...(error.info.details !== undefined ? { details: error.info.details } : {}),
        },
      }
    }

    if (error instanceof ModelCoreError) {
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          category: 'validation',
          ...(isRecordDetails(error.details) ? { details: error.details } : {}),
        },
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      costCents: 0,
      requiresPoll: false,
      error: {
        code: 'PROVIDER_ERROR',
        message,
        retryable: false,
        category: 'provider',
      },
    }
  }
}

/** 结算实际成本：能用 usage 精确结算（时长类模型）就用官方定价结算，否则保留提交前估价。 */
function completedProviderCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
  usage: unknown,
  estimatedCents: number,
): number {
  return calculateUsageCostCents(manifest, params, usage)?.cents ?? estimatedCents
}

function providerHttpCode(status: number | undefined): string {
  return status === undefined ? 'PROVIDER_HTTP_ERROR' : `PROVIDER_HTTP_${status}`
}

function isRecordDetails(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
