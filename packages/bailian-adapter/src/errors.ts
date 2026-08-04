import type { SupportedLocale } from '@puzzle-fuzzy/bailian-sdk'

export type BailianStudioBailianAdapterErrorCode =
  | 'UNKNOWN_CONSUMER_MODEL'
  | 'SDK_CONTRACT_UNCOVERED'
  | 'COVERAGE_BASELINE_DRIFT'
  | 'WORKSPACE_ID_REQUIRED'
  | 'WORKSPACE_ID_INVALID'
  | 'POLLING_NOT_SUPPORTED'
  | 'TASK_ID_REQUIRED'
  | 'UNRESOLVED_ENDPOINT_PLACEHOLDER'
  | 'UNTRUSTED_ENDPOINT'
  | 'PRICING_RATE_NOT_FOUND'
  | 'PRICING_RATE_AMBIGUOUS'
  | 'PRICING_QUANTITY_INVALID'
  | 'PRICING_UNIT_UNSUPPORTED'
  | 'PRICING_OVERFLOW'

export interface BailianStudioBailianAdapterErrorMessage {
  readonly 'zh-CN': string
  readonly 'en-US': string
}

export class BailianStudioBailianAdapterError extends Error {
  constructor(
    public readonly code: BailianStudioBailianAdapterErrorCode,
    public readonly messages: BailianStudioBailianAdapterErrorMessage,
    public readonly locale: SupportedLocale = 'zh-CN',
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(messages[locale])
    this.name = 'BailianStudioBailianAdapterError'
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      messages: this.messages,
      locale: this.locale,
      details: this.details,
    }
  }
}

export function coverageDriftError(
  reason: string,
  details: Readonly<Record<string, unknown>> = {},
): BailianStudioBailianAdapterError {
  return new BailianStudioBailianAdapterError(
    'COVERAGE_BASELINE_DRIFT',
    {
      'zh-CN': `Bailian Studio 百炼覆盖基线发生变化：${reason}`,
      'en-US': `Bailian Studio Bailian coverage baseline changed: ${reason}`,
    },
    'zh-CN',
    details,
  )
}
