import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, gte, gt, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
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
  githubId: string | null
  createdAt: Date
  updatedAt: Date
}

function toUserRecord(row: typeof users.$inferSelect): UserRepositoryRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    role: row.role as UserRepositoryRecord['role'],
    emailVerifiedAt: row.emailVerifiedAt,
    githubId: row.githubId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

export function findActiveUserByGithubId(
  db: AuthDatabase,
  githubId: string,
): Promise<UserRepositoryRecord | undefined> {
  return findActiveUserBy(db, eq(users.githubId, githubId))
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
  githubId?: string
  role?: 'user' | 'admin'
  /** 缺省为 null（未验证）。OAuth 用户传入 now 表示已验证。 */
  emailVerifiedAt?: Date | null
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
      githubId: input.githubId ?? null,
      role: input.role ?? 'user',
      emailVerifiedAt: input.emailVerifiedAt === undefined ? null : input.emailVerifiedAt,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning()

  if (row === undefined) throw new Error('Failed to create user')
  await ensureCreditAccountInTransaction(tx, { userId: id, now: input.now })
  return toUserRecord(row)
}

/** 把已存在的邮箱账号与 GitHub 账号绑定（GitHub email 与本地账号冲突时做链接）。 */
export async function linkGithubId(
  db: AuthDatabase,
  userId: string,
  githubId: string,
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ githubId, updatedAt: now, updatedBy: 'auth.github' })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
}

// ---------------------------------------------------------------------------
// 管理后台：用户查询 / 更新 / 软删除。
//
// 列表用 (createdAt desc, id desc) keyset 分页，游标为 base64url(JSON)，与
// generation-repository 的 cursor.ts 同一约定（对外不透明，解析失败统一报错）。
// 列表只投影非敏感列（不含 passwordHash）；单条查询可含已软删用户，便于管理员
// 复查被删除账号的历史数据。
// ---------------------------------------------------------------------------

/** 管理列表的用户投影（不含 passwordHash）。 */
export interface UserSummaryRecord {
  id: string
  email: string
  displayName: string | null
  role: 'user' | 'admin'
  emailVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ListActiveUsersOptions {
  /** 每页条数，clamp 到 [1,100]，默认 20。 */
  limit?: number
  /** 不透明 keyset 游标（来自上一页 nextCursor）。 */
  cursor?: string
  /** 邮箱或昵称的模糊搜索（大小写不敏感）。 */
  q?: string
  /** 页码模式：提供后走 offset 分页并返回 total（供管理后台翻页），与 cursor 互斥。 */
  page?: number
  /** offset 分页的每页条数，clamp 同 limit，默认 20。 */
  pageSize?: number
}

export interface ListActiveUsersResult {
  items: UserSummaryRecord[]
  nextCursor?: string
  /** 仅 offset 分页模式（page 已提供）返回的总条数。 */
  total?: number
}

interface UserCursorPayload {
  createdAt: string
  id: string
}

function encodeUserCursor(payload: UserCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeUserCursor(token: string): UserCursorPayload {
  let json: string
  try {
    json = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid pagination cursor')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid pagination cursor')
  }
  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'createdAt' in parsed
    && 'id' in parsed
    && typeof parsed.createdAt === 'string'
    && typeof parsed.id === 'string'
  ) {
    return { createdAt: parsed.createdAt, id: parsed.id }
  }
  throw new AuthError('AUTH_TOKEN_INVALID', 'Invalid pagination cursor')
}

function toUserSummary(row: {
  id: string
  email: string
  displayName: string | null
  role: string
  emailVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): UserSummaryRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserSummaryRecord['role'],
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function clampUserListLimit(limit: number | undefined): number {
  if (limit === undefined) return 20
  if (!Number.isFinite(limit)) return 20
  return Math.max(1, Math.min(100, Math.floor(limit)))
}

/** 分页列出未软删用户，支持 email/昵称模糊搜索；返回 keyset nextCursor。 */
export async function listActiveUsers(
  db: AuthDatabase,
  options: ListActiveUsersOptions = {},
): Promise<ListActiveUsersResult> {
  const limit = clampUserListLimit(options.limit)
  const cursor = options.cursor !== undefined ? decodeUserCursor(options.cursor) : undefined

  const conditions: SQL[] = [isNull(users.deletedAt)]
  if (options.q !== undefined && options.q.length > 0) {
    const pattern = `%${options.q}%`
    const match = or(ilike(users.email, pattern), ilike(users.displayName, pattern))
    if (match !== undefined) conditions.push(match)
  }
  if (cursor !== undefined) {
    conditions.push(sql`(${users.createdAt} < ${cursor.createdAt} OR (${users.createdAt} = ${cursor.createdAt} AND ${users.id} < ${cursor.id}))`)
  }

  const projection = {
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
    emailVerifiedAt: users.emailVerifiedAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }
  const where = and(...conditions)

  // offset 分页模式（管理后台翻页）：page 从 1 开始，额外返回总条数。
  if (options.page !== undefined) {
    const pageSize = clampUserListLimit(options.pageSize)
    const offset = Math.max(0, options.page - 1) * pageSize
    const [rows, [totalRow]] = await Promise.all([
      db.select(projection).from(users).where(where).orderBy(desc(users.createdAt), desc(users.id))
        .limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
    ])
    return { items: rows.map(toUserSummary), total: totalRow?.count ?? 0 }
  }

  const rows = await db
    .select(projection)
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    items: page.map(toUserSummary),
    ...(hasMore && last !== undefined
      ? { nextCursor: encodeUserCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) }
      : {}),
  }
}

/** 注册统计：按自然日分组计数（YYYY-MM-DD，UTC）。含已软删用户（历史注册事实）。 */
export async function countRegistrationsPerDayBetween(
  db: AuthDatabase,
  since: Date,
  until: Date,
): Promise<Array<{ date: string; count: number }>> {
  const dayExpr = sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`
  const rows = await db
    .select({
      date: sql<string>`${dayExpr}`,
      count: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(and(gte(users.createdAt, since), lt(users.createdAt, until)))
    .groupBy(dayExpr)
    .orderBy(dayExpr)
  return rows.map(row => ({ date: row.date, count: row.count }))
}

/** 统计当前未软删用户总数（管理后台概览）。 */
export async function countActiveUsersTotal(db: AuthDatabase): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.deletedAt))
  return row?.count ?? 0
}

/** 按 id 查询用户（**含已软删**），供管理后台查看历史账号。 */
export async function findUserById(
  db: AuthDatabase,
  id: string,
): Promise<UserRepositoryRecord | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row === undefined ? undefined : toUserRecord(row)
}

/** 软删除用户（置 deleted_at）。仅对未删除行生效，返回是否真的删除。 */
export async function softDeleteUser(db: AuthDatabase, userId: string, now: Date): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ deletedAt: now, deletedBy: 'admin.user.delete', updatedAt: now, updatedBy: 'admin.user.delete' })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning({ id: users.id })
  return row !== undefined
}

export interface UpdateUserAdminInput {
  displayName?: string
  role?: 'user' | 'admin'
}

/** 管理端更新用户（昵称/角色）；返回更新后的用户，用户不存在或已删除时为 undefined。 */
export async function updateUserAdmin(
  db: AuthDatabase,
  userId: string,
  input: UpdateUserAdminInput,
  now: Date,
): Promise<UserRepositoryRecord | undefined> {
  const patch: Record<string, unknown> = { updatedAt: now, updatedBy: 'admin.user.update' }
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.role !== undefined) patch.role = input.role

  const [row] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning()
  return row === undefined ? undefined : toUserRecord(row)
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
