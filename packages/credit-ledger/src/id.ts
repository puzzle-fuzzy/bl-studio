import { randomUUID } from 'node:crypto'

export function nextCreditAccountId(): string {
  return `credit_account_${randomUUID().replaceAll('-', '')}`
}

export function nextCreditLedgerEntryId(): string {
  return `credit_entry_${randomUUID().replaceAll('-', '')}`
}
