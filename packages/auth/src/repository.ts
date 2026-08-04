import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import {
  authActionTokens,
  sessions,
  users,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
} from '@bailian-studio/db'
import { ensureCreditAccountInTransaction } from '@bailian-studio/credit-ledger'
import { AuthError } from './errors'

type AuthDatabase = BailianStudioDb | BailianStudioDbTransaction

export type AuthActionTokenPurpose = 'email_verification' | 'password_reset'

/** 仅含认证字段的 user 行投影。 */
export interface UserRepositoryRecord {
  id: string
  email: string
  passwordHash: string
  displayName: string | null
  role: 'user' | 'admin'
  emailVerifiedAt: Date | null
}

function toUserRecord(row: typeof users.$inferSelect): UserRepositoryRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    role: row.role as UserRepositoryRecord['role'],
    emailVerifiedAt: row.emailVerifiedAt,
  }
}

export function hashAuthActionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function findActiveUserByEmail(
  db: AuthDatabase,
  email: string,
): Promise<UserRepositoryRecord | undefined> {
  return findActiveUserBy(db, eq(users.email, email))
}

export function findActiveUserById(
  db: AuthDatabase,
  id: string,
): Promise<UserRepositoryRecord | undefined> {
  return findActiveUserBy(db, eq(users.id, id))
}

async function findActiveUserBy(
  db: AuthDatabase,
  condition: ReturnType<typeof eq>,
): Promise<UserRepositoryRecord | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(condition, isNull(users.deletedAt)))
    .limit(1)
  return row === undefined ? undefined : toUserRecord(row)
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  displayName?: string
  now: Date
}

export async function createUserInTransaction(
  tx: BailianStudioDbTransaction,
  input: CreateUserInput,
): Promise<UserRepositoryRecord> {
  const id = randomUUID()
  const [row] = await tx
    .insert(users)
    .values({
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
      role: 'user',
      emailVerifiedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning()

  if (row === undefined) throw new Error('Failed to create user')
  await ensureCreditAccountInTransaction(tx, { userId: id, now: input.now })
  return toUserRecord(row)
}

export function createUser(db: BailianStudioDb, input: CreateUserInput): Promise<UserRepositoryRecord> {
  return db.transaction(tx => createUserInTransaction(tx, input))
}

export interface CreateSessionInput {
  id?: string
  userId: string
  expiresAt: Date
  now: Date
}

export async function createSession(
  db: AuthDatabase,
  input: CreateSessionInput,
): Promise<string> {
  const id = input.id ?? randomUUID()
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  })
  return id
}

export interface ActiveSession {
  userId: string
  expiresAt: Date
}

export async function findActiveSession(
  db: AuthDatabase,
  id: string,
  now: Date,
): Promise<ActiveSession | undefined> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), isNull(sessions.deletedAt), gt(sessions.expiresAt, now)))
    .limit(1)
  return row === undefined ? undefined : { userId: row.userId, expiresAt: row.expiresAt }
}

export async function revokeSession(db: AuthDatabase, id: string, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ deletedAt: now, deletedBy: 'auth.logout', updatedAt: now })
    .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
}

export async function revokeAllSessions(
  db: AuthDatabase,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .update(sessions)
    .set({ deletedAt: now, deletedBy: 'auth.logout-all', updatedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
}

export interface CreateAuthActionTokenInput {
  userId: string
  purpose: AuthActionTokenPurpose
  rawToken: string
  expiresAt: Date
  now: Date
}

export async function createAuthActionToken(
  db: AuthDatabase,
  input: CreateAuthActionTokenInput,
): Promise<void> {
  await db.insert(authActionTokens).values({
    id: randomUUID(),
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: hashAuthActionToken(input.rawToken),
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

export async function lockAuthTokenScope(
  tx: BailianStudioDbTransaction,
  userId: string,
  purpose: AuthActionTokenPurpose,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${purpose}`}, 0))`)
}

export interface LatestAuthActionToken {
  createdAt: Date
  expiresAt: Date
}

export async function findLatestActiveAuthActionToken(
  db: AuthDatabase,
  userId: string,
  purpose: AuthActionTokenPurpose,
): Promise<LatestAuthActionToken | undefined> {
  const [row] = await db
    .select({
      createdAt: authActionTokens.createdAt,
      expiresAt: authActionTokens.expiresAt,
    })
    .from(authActionTokens)
    .where(and(
      eq(authActionTokens.userId, userId),
      eq(authActionTokens.purpose, purpose),
      isNull(authActionTokens.consumedAt),
      isNull(authActionTokens.deletedAt),
    ))
    .orderBy(desc(authActionTokens.createdAt))
    .limit(1)
  return row
}

export async function revokeActiveTokens(
  db: AuthDatabase,
  input: { userId: string; purpose: AuthActionTokenPurpose; now: Date },
): Promise<void> {
  await db
    .update(authActionTokens)
    .set({
      consumedAt: input.now,
      updatedAt: input.now,
      updatedBy: 'auth.token-replaced',
    })
    .where(and(
      eq(authActionTokens.userId, input.userId),
      eq(authActionTokens.purpose, input.purpose),
      isNull(authActionTokens.consumedAt),
      isNull(authActionTokens.deletedAt),
    ))
}

export async function consumeAuthActionToken(
  db: AuthDatabase,
  input: { rawToken: string; purpose: AuthActionTokenPurpose; now: Date },
): Promise<UserRepositoryRecord> {
  const tokenHash = hashAuthActionToken(input.rawToken)
  const [token] = await db
    .select()
    .from(authActionTokens)
    .where(and(
      eq(authActionTokens.tokenHash, tokenHash),
      eq(authActionTokens.purpose, input.purpose),
    ))
    .for('update')
    .limit(1)

  if (token === undefined || token.deletedAt !== null) {
    throw new AuthError('AUTH_TOKEN_INVALID', '验证链接无效，请重新申请。')
  }
  if (token.consumedAt !== null) {
    throw new AuthError('AUTH_TOKEN_CONSUMED', '验证链接已经使用过，请重新申请。')
  }
  if (token.expiresAt.getTime() <= input.now.getTime()) {
    throw new AuthError('AUTH_TOKEN_EXPIRED', '验证链接已经过期，请重新申请。')
  }

  const user = await findActiveUserById(db, token.userId)
  if (user === undefined) {
    throw new AuthError('AUTH_TOKEN_INVALID', '验证链接无效，请重新申请。')
  }

  await db
    .update(authActionTokens)
    .set({
      consumedAt: input.now,
      updatedAt: input.now,
      updatedBy: 'auth.token-consumed',
    })
    .where(and(
      eq(authActionTokens.id, token.id),
      isNull(authActionTokens.consumedAt),
    ))

  return user
}

export async function markUserEmailVerified(
  db: AuthDatabase,
  userId: string,
  now: Date,
): Promise<UserRepositoryRecord> {
  const [row] = await db
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now, updatedBy: 'auth.email-verified' })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning()
  if (row === undefined) throw new AuthError('AUTH_TOKEN_INVALID', '验证链接无效，请重新申请。')
  return toUserRecord(row)
}

export async function updateUserPassword(
  db: AuthDatabase,
  userId: string,
  passwordHash: string,
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: now, updatedBy: 'auth.password-change' })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
}
