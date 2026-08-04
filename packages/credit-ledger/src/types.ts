export type CreditLedgerKind = 'grant' | 'recharge' | 'reserve' | 'settle' | 'refund' | 'adjustment'

/** PostgreSQL integer upper bound used by every persisted cents field. */
export const MAX_CREDIT_AMOUNT_CENTS = 2_147_483_647

export interface CreditAccount {
  id: string
  userId: string
  availableCents: number
  reservedCents: number
  createdAt: string
  updatedAt: string
}

export interface CreditBalance {
  userId: string
  availableCents: number
  reservedCents: number
  totalCents: number
}

export interface CreditLedgerEntry {
  id: string
  accountId: string
  userId: string
  generationId?: string
  kind: CreditLedgerKind
  availableDeltaCents: number
  reservedDeltaCents: number
  availableBalanceCents: number
  reservedBalanceCents: number
  idempotencyKey: string
  reason?: string
  actorUserId?: string
  requestId?: string
  createdAt: string
}

export interface GrantCreditsInput {
  userId: string
  amountCents: number
  reason: string
  idempotencyKey: string
  actorUserId: string
  requestId?: string
  now?: Date
}

export interface GrantCreditsResult {
  entry: CreditLedgerEntry
  balance: CreditBalance
}

export interface CreditMutationResult {
  entry: CreditLedgerEntry
  balance: CreditBalance
  anomaly?: boolean
}

export interface ListCreditLedgerInput {
  userId: string
  limit?: number
  cursor?: string
}

export interface CreditLedgerPage {
  items: CreditLedgerEntry[]
  nextCursor?: string
}

export interface AdjustCreditsInput {
  userId: string
  amountCents: number
  reason: string
  idempotencyKey: string
  actorUserId: string
  requestId?: string
  now?: Date
}

export interface CreditReconciliationViolation {
  code: 'ACCOUNT_BALANCE_MISMATCH' | 'NEGATIVE_BALANCE' | 'LEDGER_ENTRY_MISMATCH'
  userId: string
  accountId: string
  message: string
}

export interface CreditReconciliationReport {
  checkedAccounts: number
  checkedEntries: number
  violations: CreditReconciliationViolation[]
  healthy: boolean
}

export interface ReleaseStaleReservationsInput {
  olderThan: Date
  confirm: boolean
  actorUserId?: string
  requestId?: string
  now?: Date
}

export interface ReleaseStaleReservationsResult {
  candidates: number
  released: number
  skipped: boolean
  releasedEntryIds: string[]
}
