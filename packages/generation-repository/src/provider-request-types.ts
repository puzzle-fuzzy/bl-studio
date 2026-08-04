/** Provider 出站调用审计记录。 */

export type ProviderRequestOperation = 'submit' | 'poll' | 'chat' | 'cancel'
export type ProviderRequestStatus = 'started' | 'succeeded' | 'failed' | 'unsupported'

export interface ProviderRequestErrorSummary {
  readonly code: string
  readonly category: string
  readonly message: string
  readonly retriable: boolean
}

export interface ProviderRequestAudit {
  readonly id: string
  readonly generationId: string
  readonly taskId?: string
  readonly userId: string
  readonly provider: string
  readonly providerModel: string
  readonly operation: ProviderRequestOperation
  readonly status: ProviderRequestStatus
  readonly idempotencyKey?: string
  readonly providerTaskId?: string
  readonly providerRequestId?: string
  readonly attempt: number
  readonly estimatedCostCents: number
  readonly billedCostCents?: number
  readonly error?: ProviderRequestErrorSummary
  readonly startedAt: string
  readonly completedAt?: string
  readonly latencyMs?: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface StartProviderRequestInput {
  readonly generationId: string
  readonly taskId?: string
  readonly userId: string
  readonly provider: string
  readonly providerModel: string
  readonly operation: ProviderRequestOperation
  readonly idempotencyKey?: string
  readonly providerTaskId?: string
  readonly attempt: number
  readonly estimatedCostCents: number
  readonly startedAt?: string
}

export interface FinishProviderRequestInput {
  readonly auditId: string
  readonly status: Exclude<ProviderRequestStatus, 'started'>
  readonly providerTaskId?: string
  readonly providerRequestId?: string
  readonly billedCostCents?: number
  readonly error?: ProviderRequestErrorSummary
  readonly completedAt?: string
  readonly latencyMs: number
}
