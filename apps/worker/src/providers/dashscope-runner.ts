/**
 * DashScope Provider Runner
 * Implements ProviderRunner for the Alibaba Cloud DashScope (Bailian / 百炼) provider.
 *
 * Type strategy: consume provider-dashscope's discriminated unions directly and
 * reuse model-core's validation, so no unsafe casts are needed.
 */

import {
  BailianStudioBailianAdapterError,
  calculateOfficialBailianUsageCost,
  getBailianIntegrationStatus,
} from '@bailian-studio/bailian-adapter'
import { calculateUsagePriceCents, validateModelParams, type FrozenModelManifest } from '@bailian-studio/model-core'
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
  baseUrl?: string
  chatBaseUrl?: string
  workspaceId?: string
  contractLocale?: 'zh-CN' | 'en-US'
  fetch?: CreateDashScopeClientOptions['fetch']
  requestTimeoutMs?: number
}

export class DashScopeProviderRunner implements ProviderRunner {
  readonly providerId = 'dashscope'
  private readonly client

  constructor(options: CreateDashScopeRunnerOptions) {
    this.client = createDashScopeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      ...(options.chatBaseUrl !== undefined ? { chatBaseUrl: options.chatBaseUrl } : {}),
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      ...(options.contractLocale !== undefined ? { contractLocale: options.contractLocale } : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    })
  }

  supports(manifest: FrozenModelManifest): boolean {
    return manifest.provider === this.providerId
  }

  async execute(input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    const { manifest, inputParams, providerTaskId, idempotencyKey, estimatedCostCents } = input

    // Poll only needs the provider task identity. Submit-only media URLs are
    // deliberately not persisted, so validating the original submit manifest
    // here would incorrectly reject a valid async continuation.
    if (providerTaskId !== undefined) {
      try {
        return await this.poll(manifest, inputParams, providerTaskId, estimatedCostCents)
      } catch (error) {
        return this.toProviderFailure(error)
      }
    }

    // Reuse model-core's parameter validation (defaults, ranges, options).
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
   * Convert a thrown error into a non-throwing ProviderExecuteOutput.
   * DashScopeHttpError carries a classified ProviderErrorInfo; everything else
   * is treated as an opaque provider error.
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

    if (error instanceof BailianStudioBailianAdapterError) {
      return {
        success: false,
        costCents: 0,
        requiresPoll: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          category: 'validation',
          details: error.toJSON(),
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

function completedProviderCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
  usage: unknown,
  estimatedCents: number,
): number {
  if (getBailianIntegrationStatus(manifest.id).kind === 'legacy') return estimatedCents
  return calculateOfficialBailianUsageCost(manifest.id, params, usage)?.cents ?? estimatedCents
}

function providerHttpCode(status: number | undefined): string {
  return status === undefined ? 'PROVIDER_HTTP_ERROR' : `PROVIDER_HTTP_${status}`
}
