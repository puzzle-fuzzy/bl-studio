export type CreditLedgerErrorCode =
  | 'POINTS_INSUFFICIENT'
  | 'POINTS_ACCOUNT_NOT_FOUND'
  | 'POINTS_GRANT_INVALID'
  | 'POINTS_IDEMPOTENCY_CONFLICT'
  | 'POINTS_SETTLEMENT_ANOMALY'
  | 'POINTS_ADJUSTMENT_INVALID'
  | 'POINTS_INVALID_CURSOR'
  | 'POINTS_CONFIRMATION_REQUIRED'
  | 'POINTS_DATABASE_ERROR'

export class CreditLedgerError extends Error {
  constructor(
    readonly code: CreditLedgerErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'CreditLedgerError'
  }
}
