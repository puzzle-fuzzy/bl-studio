import { z } from 'zod'
import { MAX_CREDIT_AMOUNT_CENTS } from '@bailian-studio/credit-ledger'

export const GrantPointsSchema = z.object({
  amountCents: z.number().int().positive().max(MAX_CREDIT_AMOUNT_CENTS),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()

export type GrantPointsInput = z.infer<typeof GrantPointsSchema>

export const ListPointsLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict()

export const AdjustPointsSchema = z.object({
  amountCents: z.number().int().refine(value => value !== 0, 'amountCents cannot be zero').refine(value => Math.abs(value) <= MAX_CREDIT_AMOUNT_CENTS, `amountCents must be within +/-${MAX_CREDIT_AMOUNT_CENTS}`),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()
