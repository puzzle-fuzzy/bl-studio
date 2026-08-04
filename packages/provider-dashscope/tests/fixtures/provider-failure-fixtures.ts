import type { ProviderErrorCategory } from '../../src/errors'

export type ProviderOperation = 'submit' | 'poll' | 'cancel' | 'chat'

export type ProviderFailureExpectation =
  | {
      readonly outcome: 'http-error'
      readonly category: ProviderErrorCategory
      readonly retriable: boolean
      readonly code?: string
    }
  | {
      readonly outcome: 'poll-failed'
      readonly category: ProviderErrorCategory
      readonly retriable: boolean
      readonly code?: string
      readonly providerStatus: string
    }
  | {
      readonly outcome: 'cancel-unsupported'
      readonly reason: string
    }

export interface ProviderFailureFixture {
  readonly id: string
  readonly operation: ProviderOperation
  readonly status: number
  readonly body: Readonly<Record<string, unknown>>
  readonly expected: ProviderFailureExpectation
}

/**
 * 供操作级客户端测试共享的离线 wire fixtures。
 *
 * 这些刻意是响应形状的 fixtures，而非第二套 provider 契约。covered-model 的
 * schema 校验仍归 adapter 负责；本表验证的是 provider 客户端稳定的错误与
 * 生命周期投影。
 */
export const PROVIDER_FAILURE_FIXTURES: readonly ProviderFailureFixture[] = [
  {
    id: 'submit-auth-invalid-api-key',
    operation: 'submit',
    status: 401,
    body: { code: 'InvalidApiKey', message: 'Unauthorized API key' },
    expected: { outcome: 'http-error', category: 'auth', retriable: false, code: 'InvalidApiKey' },
  },
  {
    id: 'submit-validation-invalid-parameter',
    operation: 'submit',
    status: 400,
    body: { code: 'InvalidParameter', message: 'prompt is required' },
    expected: { outcome: 'http-error', category: 'validation', retriable: false, code: 'InvalidParameter' },
  },
  {
    id: 'submit-quota-arrearage',
    operation: 'submit',
    status: 400,
    body: { code: 'Arrearage', message: 'Access denied' },
    expected: { outcome: 'http-error', category: 'quota', retriable: false, code: 'Arrearage' },
  },
  {
    id: 'submit-rate-limit',
    operation: 'submit',
    status: 429,
    body: { code: 'Throttling.RateQuota', message: 'Rate limit exceeded' },
    expected: { outcome: 'http-error', category: 'rate_limit', retriable: true, code: 'Throttling.RateQuota' },
  },
  {
    id: 'submit-provider-unavailable',
    operation: 'submit',
    status: 503,
    body: { message: 'Upstream unavailable' },
    expected: { outcome: 'http-error', category: 'provider', retriable: true },
  },
  {
    id: 'poll-http-timeout',
    operation: 'poll',
    status: 408,
    body: { code: 'RequestTimeout', message: 'Provider timed out' },
    expected: { outcome: 'http-error', category: 'timeout', retriable: true, code: 'RequestTimeout' },
  },
  {
    id: 'poll-task-failed-validation',
    operation: 'poll',
    status: 200,
    body: {
      output: {
        task_id: 'fixture-task',
        task_status: 'FAILED',
        code: 'InvalidParameter',
        message: 'invalid prompt',
      },
      request_id: 'request-poll-failed',
    },
    expected: {
      outcome: 'poll-failed',
      providerStatus: 'FAILED',
      category: 'validation',
      retriable: false,
      code: 'InvalidParameter',
    },
  },
  {
    id: 'poll-task-cancelled',
    operation: 'poll',
    status: 200,
    body: {
      output: {
        task_id: 'fixture-task',
        task_status: 'CANCELED',
        code: 'TaskCanceled',
        message: 'The task was canceled.',
      },
      request_id: 'request-poll-canceled',
    },
    expected: {
      outcome: 'poll-failed',
      providerStatus: 'CANCELED',
      category: 'cancelled',
      retriable: false,
      code: 'TaskCanceled',
    },
  },
  {
    id: 'cancel-task-not-pending',
    operation: 'cancel',
    status: 400,
    body: {
      code: 'UnsupportedOperation',
      message: 'Only PENDING tasks can be canceled.',
      request_id: 'request-cancel-unsupported',
    },
    expected: {
      outcome: 'cancel-unsupported',
      reason: 'Only PENDING tasks can be canceled.',
    },
  },
  {
    id: 'chat-rate-limit',
    operation: 'chat',
    status: 429,
    body: { code: 'Throttling.RateQuota', message: 'Rate limit exceeded' },
    expected: { outcome: 'http-error', category: 'rate_limit', retriable: true, code: 'Throttling.RateQuota' },
  },
]
