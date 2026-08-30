/**
 * 积分域：用户积分账户（并发锁/快照行）与只追加余额账本。
 * 依赖 identity（users）与 generation（generation_records）。
 */

import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './identity'
import { generationRecords } from './generation'

/**
 * 用户积分账户与不可变余额账本。账户行是并发锁/快照；
 * 账本条目是只追加的审计事实。
 */
export const creditAccounts = pgTable('credit_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  availableCents: integer('available_cents').notNull().default(0),
  reservedCents: integer('reserved_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('credit_accounts_available_non_negative', sql`${table.availableCents} >= 0`),
  check('credit_accounts_reserved_non_negative', sql`${table.reservedCents} >= 0`),
])

export const creditLedgerEntries = pgTable('credit_ledger_entries', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => creditAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').references(() => generationRecords.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  availableDeltaCents: integer('available_delta_cents').notNull(),
  reservedDeltaCents: integer('reserved_delta_cents').notNull(),
  availableBalanceCents: integer('available_balance_cents').notNull(),
  reservedBalanceCents: integer('reserved_balance_cents').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  reason: text('reason'),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('credit_ledger_kind_check', sql`${table.kind} in ('grant', 'recharge', 'reserve', 'settle', 'refund', 'adjustment')`),
  uniqueIndex('credit_ledger_account_idempotency_idx').on(table.accountId, table.idempotencyKey),
  index('credit_ledger_account_created_idx').on(table.accountId, table.createdAt),
  index('credit_ledger_generation_idx').on(table.generationId),
])
