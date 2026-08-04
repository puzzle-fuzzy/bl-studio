import {
  estimateGenerationRequest,
  GenerationRepositoryError,
  type CreateGenerationInput,
  type CreateGenerationResult,
  type DailyGenerationUsage,
  type GenerationEstimate,
  type GenerationRepository,
  type GenerationRecord,
  type RequestGenerationCancelInput,
  type RetryGenerationInput,
} from '@bailian-studio/generation-repository'
import type { GenerationLimits } from '../../lib/limits'

export interface CreateGenerationUseCaseResult {
  result: CreateGenerationResult
  estimate: GenerationEstimate
  usage: DailyGenerationUsage
}

export interface CreateGenerationUseCaseDependencies {
  repository: GenerationRepository
  limits: GenerationLimits
}

export interface GenerationLifecycleUseCases {
  cancel(input: RequestGenerationCancelInput): Promise<GenerationRecord>
  retry(input: RetryGenerationInput): Promise<CreateGenerationResult>
}

/**
 * Application-layer orchestration for creating a generation.
 *
 * HTTP routes remain responsible for authentication, request validation,
 * auditing and response shaping. This use case owns the business ordering:
 * estimate first, read today's usage, enforce limits, then create the record
 * and durable submit task through the repository transaction.
 */
export function createGenerationUseCase(deps: CreateGenerationUseCaseDependencies) {
  return {
    async execute(input: CreateGenerationInput): Promise<CreateGenerationUseCaseResult> {
      const estimate = estimateGenerationRequest({
        modelId: input.modelId,
        params: input.params,
        ...(input.assetRefs !== undefined ? { assetRefs: input.assetRefs } : {}),
      })
      const usage = await getDailyGenerationUsage(deps.repository, input.userId)
      enforceDailyGenerationLimits(estimate, usage, deps.limits)
      const result = await deps.repository.createGeneration({ ...input, quota: deps.limits })
      return { result, estimate, usage }
    },
  }
}

/**
 * Application-layer entry points for user-driven lifecycle transitions.
 * Ownership, retryability and state transitions remain repository invariants;
 * the HTTP layer only supplies authenticated, schema-validated input and shapes
 * the response/audit event.
 */
export function createGenerationLifecycleUseCases(
  repository: GenerationRepository,
  limits?: GenerationLimits,
): GenerationLifecycleUseCases {
  return {
    cancel: input => repository.requestGenerationCancel(input),
    retry: input => repository.retryGeneration({
      ...input,
      ...(limits !== undefined ? { quota: limits } : {}),
    }),
  }
}

export async function getDailyGenerationUsage(
  repository: GenerationRepository,
  userId: string,
): Promise<DailyGenerationUsage> {
  if (repository.getDailyGenerationUsage === undefined) {
    return { attemptCount: 0, successfulCount: 0, generationCount: 0, estimatedCents: 0, chargedCents: 0, providerCostCents: 0 }
  }
  const now = new Date()
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const until = new Date(since.getTime() + 24 * 60 * 60 * 1000)
  return repository.getDailyGenerationUsage({ userId, since: since.toISOString(), until: until.toISOString() })
}

export function enforceDailyGenerationLimits(
  estimate: GenerationEstimate,
  usage: DailyGenerationUsage,
  limits: GenerationLimits,
): void {
  const limitDetails = {
    attemptCount: usage.attemptCount,
    successfulCount: usage.successfulCount,
    generationCount: usage.attemptCount,
    estimatedCents: usage.estimatedCents,
    requestedCents: estimate.costEstimate,
    dailyQuotaMode: limits.dailyQuotaMode,
    ...(limits.dailyTaskLimit !== undefined ? { dailyTaskLimit: limits.dailyTaskLimit } : {}),
    ...(limits.dailyCostLimitCents !== undefined ? { dailyCostLimitCents: limits.dailyCostLimitCents } : {}),
  }

  const quotaCount = limits.dailyQuotaMode === 'successful' ? usage.successfulCount : usage.attemptCount
  if (limits.dailyTaskLimit !== undefined && quotaCount >= limits.dailyTaskLimit) {
    throw new GenerationRepositoryError('GENERATION_DAILY_LIMIT_EXCEEDED', 'Daily generation task limit exceeded', limitDetails)
  }
  if (limits.dailyCostLimitCents !== undefined && usage.estimatedCents + estimate.costEstimate > limits.dailyCostLimitCents) {
    throw new GenerationRepositoryError('GENERATION_DAILY_LIMIT_EXCEEDED', 'Daily generation cost limit exceeded', limitDetails)
  }
}
