/**
 * 社区画廊持久化接缝：作品可见性、画廊列表/详情、收藏与点赞。
 *
 * 与 repository.ts 的主体对象通过 `...createContentRepository(db)` 组合进
 * `createGenerationRepository` 的返回值（见 repository.ts）。独立成模块是为了
 * 控制 repository.ts 的体积，并让"内容域"的方法（gallery / like / favorite）
 * 与"生成生命周期"方法分开维护。
 *
 * 可见性不变量（与 API 层约定）：
 *  - 画廊列表/详情/产物只暴露 visibility='public' 且 status='succeeded'、
 *    未删未藏的记录；
 *  - 点赞仅对公开可见记录；
 *  - 收藏对"本人可见"的记录（自己的任意未删记录，或公开成功记录）；
 *  - 越权访问统一按 GENERATION_NOT_FOUND 处理（IDOR 模式：不存在与不可见同响应）。
 */
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import {
  generationArtifacts,
  generationFavorites,
  generationLikes,
  generationRecords,
  modelCosts,
  notifications,
  promptLibrary,
  userFeedback,
  users,
  type BailianStudioDb,
} from '@bailian-studio/db'
import type { ModelCategory } from '@bailian-studio/model-core'
import { GenerationRepositoryError } from './errors'
import { clampLimit, decodeCursor, encodeCursor } from './cursor'
import { toGenerationArtifact, toGenerationRecord } from './mappers'
import type {
  AdminGalleryItem,
  CostMarginRow,
  FeedbackKind,
  FeedbackStatus,
  GalleryDetail,
  GalleryItem,
  GallerySort,
  GalleryVisibility,
  GenerationArtifact,
  ListAdminGalleryResult,
  ListFeedbackResult,
  ListGalleryResult,
  ListNotificationsResult,
  ListPromptLibraryResult,
  ModelCost,
  NotificationItem,
  NotificationKind,
  PromptLibraryItem,
  RetentionAnalytics,
  UserFeedback,
} from './types'

export interface ContentRepository {
  setGenerationVisibility(input: {
    userId: string
    recordId: string
    visibility: GalleryVisibility
    now?: string
  }): Promise<import('./types').GenerationRecord>
  listGalleryGenerations(input: {
    cursor?: string
    limit?: number
    category?: ModelCategory
    modelId?: string
    authorId?: string
    q?: string
    sort?: GallerySort
    viewerId?: string
  }): Promise<ListGalleryResult>
  getGalleryGeneration(input: { recordId: string; viewerId?: string }): Promise<GalleryDetail | undefined>
  getGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined>
  setGenerationLike(input: {
    userId: string
    recordId: string
    liked: boolean
  }): Promise<{ liked: boolean; likeCount: number }>
  setGenerationFavorite(input: {
    userId: string
    recordId: string
    favorited: boolean
  }): Promise<{ favorited: boolean }>
  /** 查询 viewer 是否已收藏某记录；记录对 viewer 不可见时返回 undefined。 */
  getGenerationFavorited(input: { userId: string; recordId: string }): Promise<boolean | undefined>
  listGenerationFavorites(input: { userId: string; cursor?: string; limit?: number }): Promise<ListGalleryResult>

  // -------------------------------------------------------------------------
  // 社区治理（admin）：含隐藏作品的画廊列表 + 下架/恢复 + 封禁联动。
  // -------------------------------------------------------------------------
  listAdminGalleryGenerations(input: {
    cursor?: string
    limit?: number
    includeHidden?: boolean
    q?: string
    authorId?: string
  }): Promise<ListAdminGalleryResult>
  /** admin 画廊产物读取：不检查 hiddenAt（治理需预览已隐藏作品）。 */
  getAdminGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined>
  setGalleryRecordHidden(input: { recordId: string; hidden: boolean; actorId: string }): Promise<void>
  /** 封禁联动：把某用户全部公开成功且未隐藏的作品批量置 hiddenAt。 */
  hideUserPublicWorks(input: { userId: string; actorId: string }): Promise<number>

  // -------------------------------------------------------------------------
  // 社交通知：作者收到点赞/收藏通知。
  // -------------------------------------------------------------------------
  /** 读取记录作者 id（不存在或已删除返回 undefined）。 */
  getGenerationOwner(recordId: string): Promise<string | undefined>
  createSocialNotification(input: {
    recipientId: string
    actorId?: string
    kind: NotificationKind
    recordId?: string
    title: string
    body: string
  }): Promise<void>
  listNotifications(input: { userId: string; cursor?: string; limit?: number }): Promise<ListNotificationsResult>
  countUnreadNotifications(userId: string): Promise<number>
  markNotificationRead(input: { userId: string; notificationId: string }): Promise<boolean>
  markAllNotificationsRead(userId: string): Promise<number>

  // -------------------------------------------------------------------------
  // 提示词资产库（服务端命名库，owner 限定）。
  // -------------------------------------------------------------------------
  listPromptLibrary(input: { userId: string; cursor?: string; limit?: number; q?: string }): Promise<ListPromptLibraryResult>
  createPromptLibraryItem(input: {
    userId: string
    name: string
    modelId: string
    prompt: string
    params: Record<string, unknown>
  }): Promise<PromptLibraryItem>
  updatePromptLibraryItem(input: {
    userId: string
    itemId: string
    name?: string
    prompt?: string
    params?: Record<string, unknown>
  }): Promise<PromptLibraryItem>
  deletePromptLibraryItem(input: { userId: string; itemId: string }): Promise<void>

  // -------------------------------------------------------------------------
  // 管理分析：每模型成本毛利 + 留存漏斗 + 成本单价配置。
  // -------------------------------------------------------------------------
  listModelCosts(): Promise<ModelCost[]>
  upsertModelCosts(entries: Array<{ modelId: string; unitCostCents: number }>): Promise<void>
  getCostMarginAnalytics(input: { from: string; to: string }): Promise<CostMarginRow[]>
  getRetentionAnalytics(input: { since: string }): Promise<RetentionAnalytics>

  // -------------------------------------------------------------------------
  // 用户反馈通道（提交 + admin 列表/状态流转）。
  // -------------------------------------------------------------------------
  submitFeedback(input: { userId: string; kind: FeedbackKind; content: string }): Promise<UserFeedback>
  listFeedback(input: { cursor?: string; limit?: number; status?: FeedbackStatus }): Promise<ListFeedbackResult>
  updateFeedbackStatus(input: { itemId: string; status: FeedbackStatus; resolvedBy: string }): Promise<UserFeedback>
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createContentRepository(db: BailianStudioDb): ContentRepository {
  async function setGenerationVisibility(input: {
    userId: string
    recordId: string
    visibility: GalleryVisibility
    now?: string
  }) {
    const changedAt = new Date(input.now ?? nowIso())
    const [row] = await db
      .update(generationRecords)
      .set({ visibility: input.visibility, updatedAt: changedAt, updatedBy: input.userId })
      .where(and(
        eq(generationRecords.id, input.recordId),
        eq(generationRecords.userId, input.userId),
      ))
      .returning()

    if (row === undefined) {
      throw new GenerationRepositoryError(
        'GENERATION_NOT_FOUND',
        `Generation not found: ${input.recordId}`,
      )
    }
    return toGenerationRecord(row)
  }

  async function listGalleryGenerations(input: {
    cursor?: string
    limit?: number
    category?: ModelCategory
    modelId?: string
    authorId?: string
    q?: string
    sort?: GallerySort
    viewerId?: string
  }): Promise<ListGalleryResult> {
    const limit = clampLimit(input.limit)
    const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined
    const hot = input.sort === 'hot'

    const conditions: SQL[] = [
      eq(generationRecords.visibility, 'public'),
      eq(generationRecords.status, 'succeeded'),
      isNull(generationRecords.deletedAt),
      isNull(generationRecords.hiddenAt),
    ]
    if (input.category !== undefined) conditions.push(eq(generationRecords.category, input.category))
    if (input.modelId !== undefined) conditions.push(eq(generationRecords.modelId, input.modelId))
    if (input.authorId !== undefined) conditions.push(eq(generationRecords.userId, input.authorId))
    if (input.q !== undefined && input.q.length > 0) {
      // 参数正文（含 prompt）整体按文本搜索；画廊量级小，::text ilike 可接受。
      conditions.push(ilike(sql`${generationRecords.inputParamsJson}::text`, `%${input.q}%`))
    }

    // hot 排序需要每行点赞数作为排序/游标键（无赞按 0 处理）。
    const likeCountSub = hot
      ? db.select({ recordId: generationLikes.recordId, likeCount: sql<number>`count(*)::int`.as('like_count') })
          .from(generationLikes)
          .groupBy(generationLikes.recordId)
          .as('gallery_like_count')
      : undefined
    const likeCountExpr = likeCountSub !== undefined ? sql<number>`coalesce(${likeCountSub.likeCount}, 0)::int` : undefined

    if (cursor !== undefined) {
      if (hot) {
        const likeCount = cursor.likeCount ?? 0
        conditions.push(sql`(
          ${likeCountExpr} < ${likeCount}
          OR (${likeCountExpr} = ${likeCount} AND ${generationRecords.createdAt} < ${cursor.createdAt})
          OR (${likeCountExpr} = ${likeCount} AND ${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id})
        )`)
      } else {
        conditions.push(sql`(${generationRecords.createdAt} < ${cursor.createdAt} OR (${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id}))`)
      }
    }

    let rows: GalleryListRow[]
    if (hot) {
      rows = await db
        .select({
          record: generationRecords,
          authorId: users.id,
          authorDisplayName: users.displayName,
          likeCount: likeCountExpr!,
        })
        .from(generationRecords)
        .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
        .leftJoin(likeCountSub!, eq(likeCountSub!.recordId, generationRecords.id))
        .where(and(...conditions))
        .orderBy(desc(likeCountExpr!), desc(generationRecords.createdAt), desc(generationRecords.id))
        .limit(limit + 1)
    } else {
      rows = await db
        .select({
          record: generationRecords,
          authorId: users.id,
          authorDisplayName: users.displayName,
        })
        .from(generationRecords)
        .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
        .where(and(...conditions))
        .orderBy(desc(generationRecords.createdAt), desc(generationRecords.id))
        .limit(limit + 1)
    }

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    const items = await hydrateGalleryItems(db, page, input.viewerId)

    return {
      items,
      ...(hasMore && last !== undefined
        ? {
            nextCursor: encodeCursor(hot
              ? { likeCount: last.likeCount ?? 0, createdAt: last.record.createdAt.toISOString(), id: last.record.id }
              : { createdAt: last.record.createdAt.toISOString(), id: last.record.id }),
          }
        : {}),
    }
  }

  async function getGalleryGeneration(input: { recordId: string; viewerId?: string }): Promise<GalleryDetail | undefined> {
    const [row] = await db
      .select({
        record: generationRecords,
        authorId: users.id,
        authorDisplayName: users.displayName,
      })
      .from(generationRecords)
      .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
      .where(and(
        eq(generationRecords.id, input.recordId),
        eq(generationRecords.visibility, 'public'),
        eq(generationRecords.status, 'succeeded'),
        isNull(generationRecords.deletedAt),
        isNull(generationRecords.hiddenAt),
      ))
      .limit(1)

    if (row === undefined) return undefined

    const record = toGenerationRecord(row.record)
    // 注意：这里过滤的是「产物持久化状态」（pending|stored|failed），不是记录状态。
    // generation_records 用 'succeeded'，generation_artifacts 用 'stored'——别写混。
    const artifactRows = await db
      .select()
      .from(generationArtifacts)
      .where(and(
        eq(generationArtifacts.recordId, input.recordId),
        eq(generationArtifacts.status, 'stored'),
        isNull(generationArtifacts.deletedAt),
      ))
      .orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id))
    const artifacts = artifactRows.map(toGenerationArtifact)
    const [likeCount, liked, favorited] = await Promise.all([
      countLikesByRecords(db, [input.recordId]).then(map => map.get(input.recordId) ?? 0),
      viewerLiked(db, input.viewerId, [input.recordId]),
      viewerFavorited(db, input.viewerId, [input.recordId]),
    ])

    return {
      record: toPublicGalleryRecord(record),
      artifacts,
      author: { id: row.authorId, displayName: row.authorDisplayName },
      likeCount,
      likedByViewer: liked,
      favoritedByViewer: favorited,
    }
  }

  /** 画廊跨用户产物：同时校验产物与父记录都公开可见（不存在/不可见统一 undefined）。 */
  async function getGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined> {
    const [row] = await db
      .select({ artifact: generationArtifacts })
      .from(generationArtifacts)
      .innerJoin(generationRecords, eq(generationRecords.id, generationArtifacts.recordId))
      .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
      .where(and(
        eq(generationArtifacts.id, input.artifactId),
        eq(generationArtifacts.recordId, input.recordId),
        // 产物用 'stored'（不是记录的 'succeeded'，见 getGalleryGeneration 注释）。
        eq(generationArtifacts.status, 'stored'),
        isNull(generationArtifacts.deletedAt),
        eq(generationRecords.visibility, 'public'),
        eq(generationRecords.status, 'succeeded'),
        isNull(generationRecords.deletedAt),
        isNull(generationRecords.hiddenAt),
      ))
      .limit(1)
    return row === undefined ? undefined : toGenerationArtifact(row.artifact)
  }

  async function setGenerationLike(input: { userId: string; recordId: string; liked: boolean }) {
    if (!(await isPublicVisible(db, input.recordId))) {
      throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${input.recordId}`)
    }
    if (input.liked) {
      await db
        .insert(generationLikes)
        .values({ recordId: input.recordId, userId: input.userId, createdAt: new Date() })
        .onConflictDoNothing({ target: [generationLikes.recordId, generationLikes.userId] })
    } else {
      await db
        .delete(generationLikes)
        .where(and(
          eq(generationLikes.recordId, input.recordId),
          eq(generationLikes.userId, input.userId),
        ))
    }
    const likeCount = (await countLikesByRecords(db, [input.recordId])).get(input.recordId) ?? 0
    return { liked: input.liked, likeCount }
  }

  async function setGenerationFavorite(input: { userId: string; recordId: string; favorited: boolean }) {
    if (!(await isVisibleToViewer(db, input.recordId, input.userId))) {
      throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${input.recordId}`)
    }
    if (input.favorited) {
      await db
        .insert(generationFavorites)
        .values({ recordId: input.recordId, userId: input.userId, createdAt: new Date() })
        .onConflictDoNothing({ target: [generationFavorites.recordId, generationFavorites.userId] })
    } else {
      await db
        .delete(generationFavorites)
        .where(and(
          eq(generationFavorites.recordId, input.recordId),
          eq(generationFavorites.userId, input.userId),
        ))
    }
    return { favorited: input.favorited }
  }

  async function getGenerationFavorited(input: { userId: string; recordId: string }): Promise<boolean | undefined> {
    if (!(await isVisibleToViewer(db, input.recordId, input.userId))) return undefined
    const [row] = await db
      .select({ recordId: generationFavorites.recordId })
      .from(generationFavorites)
      .where(and(
        eq(generationFavorites.recordId, input.recordId),
        eq(generationFavorites.userId, input.userId),
      ))
      .limit(1)
    return row !== undefined
  }

  /** 我的收藏：按收藏时间倒序（favorites.createdAt 为游标排序键）。 */
  async function listGenerationFavorites(input: { userId: string; cursor?: string; limit?: number }): Promise<ListGalleryResult> {
    const limit = clampLimit(input.limit)
    const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined

    const conditions: SQL[] = [
      eq(generationFavorites.userId, input.userId),
      isNull(generationRecords.deletedAt),
      // 与详情可见性一致：作者隐藏（hiddenAt）或封禁/删除后从收藏列表消失，
      // 避免列表可见但详情 404 的不一致（回归：见计划文档 §1.3）。
      isNull(generationRecords.hiddenAt),
      sql`(${generationRecords.userId} = ${input.userId} OR (${generationRecords.visibility} = 'public' AND ${generationRecords.status} = 'succeeded'))`,
    ]
    if (cursor !== undefined) {
      conditions.push(sql`(${generationFavorites.createdAt} < ${cursor.createdAt} OR (${generationFavorites.createdAt} = ${cursor.createdAt} AND ${generationFavorites.recordId} < ${cursor.id}))`)
    }

    const rows = await db
      .select({
        record: generationRecords,
        authorId: users.id,
        authorDisplayName: users.displayName,
        favoriteCreatedAt: generationFavorites.createdAt,
        favoriteRecordId: generationFavorites.recordId,
      })
      .from(generationFavorites)
      .innerJoin(generationRecords, eq(generationRecords.id, generationFavorites.recordId))
      .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
      .where(and(...conditions))
      // 游标排序键必须是「收藏时间」（favorites.createdAt），不能用作品创建时间
      // 编码——否则第二页恒空（收藏必然晚于创建）。次级键补 recordId 保证同毫秒稳定。
      .orderBy(desc(generationFavorites.createdAt), desc(generationFavorites.recordId))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    const items = await hydrateGalleryItems(db, page, input.userId)

    return {
      items,
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor({ createdAt: last.favoriteCreatedAt.toISOString(), id: last.favoriteRecordId }) }
        : {}),
    }
  }

  // ---------------------------------------------------------------------------
  // 社区治理（admin）：含隐藏作品的画廊列表 + 下架/恢复 + 封禁联动。
  // ---------------------------------------------------------------------------

  /** admin 画廊治理列表：含隐藏作品（includeHidden 控制），可按作者/提示词搜索。 */
  async function listAdminGalleryGenerations(input: {
    cursor?: string
    limit?: number
    includeHidden?: boolean
    q?: string
    authorId?: string
  }): Promise<ListAdminGalleryResult> {
    const limit = clampLimit(input.limit)
    const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined

    const conditions: SQL[] = [
      eq(generationRecords.visibility, 'public'),
      eq(generationRecords.status, 'succeeded'),
      isNull(generationRecords.deletedAt),
    ]
    // admin 需要看到全部公开作品（含已隐藏的）做治理；includeHidden 缺省为 false
    // 时只列当前在画廊可见的作品。
    if (input.includeHidden !== true) conditions.push(isNull(generationRecords.hiddenAt))
    if (input.authorId !== undefined) conditions.push(eq(generationRecords.userId, input.authorId))
    if (input.q !== undefined && input.q.length > 0) {
      conditions.push(ilike(sql`${generationRecords.inputParamsJson}::text`, `%${input.q}%`))
    }
    if (cursor !== undefined) {
      conditions.push(sql`(${generationRecords.createdAt} < ${cursor.createdAt} OR (${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id}))`)
    }

    const rows = await db
      .select({
        record: generationRecords,
        authorId: users.id,
        authorDisplayName: users.displayName,
      })
      .from(generationRecords)
      // 治理视角不过滤封禁作者（被封用户的公开内容恰恰需要下架）。
      .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.deletedAt)))
      .where(and(...conditions))
      .orderBy(desc(generationRecords.createdAt), desc(generationRecords.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    const items = await hydrateAdminGalleryItems(db, page)

    return {
      items,
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor({ createdAt: last.record.createdAt.toISOString(), id: last.record.id }) }
        : {}),
    }
  }

  /** admin 画廊产物读取：与 getGalleryArtifact 相同但**不检查 hiddenAt**（治理需预览已隐藏作品）。 */
  async function getAdminGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined> {
    const [row] = await db
      .select({ artifact: generationArtifacts })
      .from(generationArtifacts)
      .innerJoin(generationRecords, eq(generationRecords.id, generationArtifacts.recordId))
      .where(and(
        eq(generationArtifacts.id, input.artifactId),
        eq(generationArtifacts.recordId, input.recordId),
        eq(generationArtifacts.status, 'stored'),
        isNull(generationArtifacts.deletedAt),
        eq(generationRecords.visibility, 'public'),
        eq(generationRecords.status, 'succeeded'),
        isNull(generationRecords.deletedAt),
      ))
      .limit(1)
    return row === undefined ? undefined : toGenerationArtifact(row.artifact)
  }

  /** admin 下架/恢复一条公开作品：写 hiddenAt/hiddenBy，仅限 public+succeeded 未删记录。 */
  async function setGalleryRecordHidden(input: { recordId: string; hidden: boolean; actorId: string }): Promise<void> {
    const now = new Date()
    const [row] = await db
      .update(generationRecords)
      .set(input.hidden
        ? { hiddenAt: now, hiddenBy: input.actorId, updatedAt: now, updatedBy: input.actorId }
        : { hiddenAt: null, hiddenBy: null, updatedAt: now, updatedBy: input.actorId })
      .where(and(
        eq(generationRecords.id, input.recordId),
        eq(generationRecords.visibility, 'public'),
        eq(generationRecords.status, 'succeeded'),
        isNull(generationRecords.deletedAt),
      ))
      .returning({ id: generationRecords.id })
    if (row === undefined) {
      throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${input.recordId}`)
    }
  }

  /** 封禁联动：把某用户全部公开成功且未隐藏的作品批量置 hiddenAt（解封不自动恢复）。 */
  async function hideUserPublicWorks(input: { userId: string; actorId: string }): Promise<number> {
    const now = new Date()
    const rows = await db
      .update(generationRecords)
      .set({ hiddenAt: now, hiddenBy: input.actorId, updatedAt: now, updatedBy: input.actorId })
      .where(and(
        eq(generationRecords.userId, input.userId),
        eq(generationRecords.visibility, 'public'),
        eq(generationRecords.status, 'succeeded'),
        isNull(generationRecords.deletedAt),
        isNull(generationRecords.hiddenAt),
      ))
      .returning({ id: generationRecords.id })
    return rows.length
  }

  // ---------------------------------------------------------------------------
  // 社交通知：作者收到点赞/收藏通知。
  // ---------------------------------------------------------------------------

  /** 读取记录作者 id（不存在或已删除返回 undefined）。 */
  async function getGenerationOwner(recordId: string): Promise<string | undefined> {
    const [row] = await db
      .select({ userId: generationRecords.userId })
      .from(generationRecords)
      .where(and(eq(generationRecords.id, recordId), isNull(generationRecords.deletedAt)))
      .limit(1)
    return row?.userId
  }

  /** 创建一条社交通知（best-effort：失败不影响点赞/收藏主流程，由调用方吞掉）。 */
  async function createSocialNotification(input: {
    recipientId: string
    actorId?: string
    kind: NotificationKind
    recordId?: string
    title: string
    body: string
  }): Promise<void> {
    const now = new Date()
    await db.insert(notifications).values({
      id: randomUUID(),
      userId: input.recipientId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      createdAt: now,
      updatedAt: now,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
    })
  }

  /** 分页列出某用户的通知（keyset：createdAt desc, id desc）。 */
  async function listNotifications(input: { userId: string; cursor?: string; limit?: number }): Promise<ListNotificationsResult> {
    const limit = clampLimit(input.limit)
    const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined

    const conditions: SQL[] = [eq(notifications.userId, input.userId)]
    if (cursor !== undefined) {
      conditions.push(sql`(${notifications.createdAt} < ${cursor.createdAt} OR (${notifications.createdAt} = ${cursor.createdAt} AND ${notifications.id} < ${cursor.id}))`)
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    return {
      items: page.map(toNotificationItem),
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) }
        : {}),
    }
  }

  async function countUnreadNotifications(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    return row?.count ?? 0
  }

  async function markNotificationRead(input: { userId: string; notificationId: string }): Promise<boolean> {
    const [row] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, input.userId)))
      .returning({ id: notifications.id })
    return row !== undefined
  }

  async function markAllNotificationsRead(userId: string): Promise<number> {
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id })
    return rows.length
  }

  async function listPromptLibrary(input: { userId: string; cursor?: string; limit?: number; q?: string }): Promise<ListPromptLibraryResult> {
    const limit = clampLimit(input.limit)
    const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined

    const conditions: SQL[] = [eq(promptLibrary.userId, input.userId), isNull(promptLibrary.deletedAt)]
    if (input.q !== undefined && input.q.length > 0) {
      const pattern = `%${input.q}%`
      const match = or(ilike(promptLibrary.name, pattern), ilike(promptLibrary.prompt, pattern))
      if (match !== undefined) conditions.push(match)
    }
    if (cursor !== undefined) {
      conditions.push(sql`(${promptLibrary.updatedAt} < ${cursor.createdAt} OR (${promptLibrary.updatedAt} = ${cursor.createdAt} AND ${promptLibrary.id} < ${cursor.id}))`)
    }

    const rows = await db
      .select()
      .from(promptLibrary)
      .where(and(...conditions))
      .orderBy(desc(promptLibrary.updatedAt), desc(promptLibrary.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    return {
      items: page.map(toPromptLibraryItem),
      ...(hasMore && last !== undefined
        ? { nextCursor: encodeCursor({ createdAt: last.updatedAt.toISOString(), id: last.id }) }
        : {}),
    }
  }

  async function createPromptLibraryItem(input: {
    userId: string
    name: string
    modelId: string
    prompt: string
    params: Record<string, unknown>
  }): Promise<PromptLibraryItem> {
    const now = new Date()
    const [row] = await db
      .insert(promptLibrary)
      .values({
        id: randomUUID(),
        userId: input.userId,
        name: input.name,
        modelId: input.modelId,
        prompt: input.prompt,
        paramsJson: input.params,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (row === undefined) {
      throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to create prompt library item')
    }
    return toPromptLibraryItem(row)
  }

  async function updatePromptLibraryItem(input: {
    userId: string
    itemId: string
    name?: string
    prompt?: string
    params?: Record<string, unknown>
  }): Promise<PromptLibraryItem> {
    const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: input.userId }
    if (input.name !== undefined) patch.name = input.name
    if (input.prompt !== undefined) patch.prompt = input.prompt
    if (input.params !== undefined) patch.paramsJson = input.params

    const [row] = await db
      .update(promptLibrary)
      .set(patch)
      .where(and(eq(promptLibrary.id, input.itemId), eq(promptLibrary.userId, input.userId), isNull(promptLibrary.deletedAt)))
      .returning()
    if (row === undefined) {
      throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Prompt library item not found: ${input.itemId}`)
    }
    return toPromptLibraryItem(row)
  }

  async function deletePromptLibraryItem(input: { userId: string; itemId: string }): Promise<void> {
    const now = new Date()
    const [row] = await db
      .update(promptLibrary)
      .set({ deletedAt: now, deletedBy: input.userId, updatedAt: now, updatedBy: input.userId })
      .where(and(eq(promptLibrary.id, input.itemId), eq(promptLibrary.userId, input.userId), isNull(promptLibrary.deletedAt)))
      .returning({ id: promptLibrary.id })
    if (row === undefined) {
      throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Prompt library item not found: ${input.itemId}`)
    }
  }

  async function listModelCosts(): Promise<ModelCost[]> {
    const rows = await db.select().from(modelCosts).orderBy(asc(modelCosts.modelId))
    return rows.map(row => ({
      modelId: row.modelId,
      unitCostCents: row.unitCostCents,
      currency: row.currency,
      updatedAt: row.updatedAt.toISOString(),
    }))
  }

  async function upsertModelCosts(entries: Array<{ modelId: string; unitCostCents: number }>): Promise<void> {
    if (entries.length === 0) return
    const now = new Date()
    await db.transaction(async tx => {
      for (const entry of entries) {
        await tx
          .insert(modelCosts)
          .values({
            modelId: entry.modelId,
            unitCostCents: entry.unitCostCents,
            updatedAt: now,
            createdAt: now,
          })
          .onConflictDoUpdate({
            target: modelCosts.modelId,
            set: { unitCostCents: entry.unitCostCents, updatedAt: now, updatedBy: 'admin.model-costs' },
          })
      }
    })
  }

  /** 成本毛利：窗口内按 modelId 聚合成功生成 → 收入/成本/毛利（分）。 */
  async function getCostMarginAnalytics(input: { from: string; to: string }): Promise<CostMarginRow[]> {
    const rows = await db
      .select({
        modelId: generationRecords.modelId,
        calls: sql<number>`count(*)::int`,
        revenueCents: sql<number>`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)::int`,
      })
      .from(generationRecords)
      .where(and(
        eq(generationRecords.status, 'succeeded'),
        gte(generationRecords.createdAt, new Date(input.from)),
        lt(generationRecords.createdAt, new Date(input.to)),
        isNull(generationRecords.deletedAt),
      ))
      .groupBy(generationRecords.modelId)
      .orderBy(desc(sql`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)`))

    const costRows = await db.select().from(modelCosts)
    const unitCostByModel = new Map(costRows.map(row => [row.modelId, row.unitCostCents]))

    return rows.map(row => {
      const unitCostCents = unitCostByModel.get(row.modelId) ?? 0
      const costCents = row.calls * unitCostCents
      return {
        modelId: row.modelId,
        calls: row.calls,
        revenueCents: row.revenueCents,
        unitCostCents,
        costCents,
        marginCents: row.revenueCents - costCents,
      }
    })
  }

  /** 留存漏斗：窗口内 注册→首生成→首成功→活跃（≥2 个不同日生成）。 */
  async function getRetentionAnalytics(input: { since: string }): Promise<RetentionAnalytics> {
    const since = new Date(input.since)
    const [firstGeneration, firstSuccess, activeTwoDays] = await Promise.all([
      countDistinctUsersWithGeneration(db, since, 'any'),
      countDistinctUsersWithGeneration(db, since, 'succeeded'),
      countDistinctUsersActiveTwoDays(db, since),
    ])
    return { firstGeneration, firstSuccess, activeTwoDays }
  }

  return {
    setGenerationVisibility,
    listGalleryGenerations,
    getGalleryGeneration,
    getGalleryArtifact,
    setGenerationLike,
    setGenerationFavorite,
    getGenerationFavorited,
    listGenerationFavorites,
    listAdminGalleryGenerations,
    getAdminGalleryArtifact,
    setGalleryRecordHidden,
    hideUserPublicWorks,
    getGenerationOwner,
    createSocialNotification,
    listNotifications,
    countUnreadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    listPromptLibrary,
    createPromptLibraryItem,
    updatePromptLibraryItem,
    deletePromptLibraryItem,
    listModelCosts,
    upsertModelCosts,
    getCostMarginAnalytics,
    getRetentionAnalytics,
    submitFeedback: input => submitFeedback(db, input),
    listFeedback: input => listFeedback(db, input),
    updateFeedbackStatus: input => updateFeedbackStatus(db, input),
  }
}

/** 提交反馈（kind/content 由 API 层校验）。 */
async function submitFeedback(db: BailianStudioDb, input: { userId: string; kind: FeedbackKind; content: string }): Promise<UserFeedback> {
  const now = new Date()
  const [row] = await db
    .insert(userFeedback)
    .values({
      id: randomUUID(),
      userId: input.userId,
      kind: input.kind,
      content: input.content,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  if (row === undefined) {
    throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to submit feedback')
  }
  return toFeedback(row)
}

/** admin 列表反馈：按 status 过滤 + keyset（createdAt desc, id desc）。 */
async function listFeedback(db: BailianStudioDb, input: { cursor?: string; limit?: number; status?: FeedbackStatus }): Promise<ListFeedbackResult> {
  const limit = clampLimit(input.limit)
  const cursor = input.cursor !== undefined ? decodeCursor(input.cursor) : undefined
  const conditions: SQL[] = [isNull(userFeedback.deletedAt)]
  if (input.status !== undefined) conditions.push(eq(userFeedback.status, input.status))
  if (cursor !== undefined) {
    conditions.push(sql`(${userFeedback.createdAt} < ${cursor.createdAt} OR (${userFeedback.createdAt} = ${cursor.createdAt} AND ${userFeedback.id} < ${cursor.id}))`)
  }
  const rows = await db
    .select()
    .from(userFeedback)
    .where(and(...conditions))
    .orderBy(desc(userFeedback.createdAt), desc(userFeedback.id))
    .limit(limit + 1)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return {
    items: page.map(toFeedback),
    ...(hasMore && last !== undefined
      ? { nextCursor: encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) }
      : {}),
  }
}

/** admin 更新反馈状态（resolved/closed 记录 resolvedBy/At）。 */
async function updateFeedbackStatus(db: BailianStudioDb, input: { itemId: string; status: FeedbackStatus; resolvedBy: string }): Promise<UserFeedback> {
  const now = new Date()
  const terminal = input.status === 'resolved' || input.status === 'closed'
  const [row] = await db
    .update(userFeedback)
    .set({
      status: input.status,
      ...(terminal ? { resolvedBy: input.resolvedBy, resolvedAt: now } : {}),
      updatedAt: now,
      updatedBy: input.resolvedBy,
    })
    .where(and(eq(userFeedback.id, input.itemId), isNull(userFeedback.deletedAt)))
    .returning()
  if (row === undefined) {
    throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Feedback not found: ${input.itemId}`)
  }
  return toFeedback(row)
}

/** notifications 行 → 领域类型。 */
function toNotificationItem(row: typeof notifications.$inferSelect): NotificationItem {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    ...(row.actorId !== null ? { actorId: row.actorId } : {}),
    ...(row.recordId !== null ? { recordId: row.recordId } : {}),
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** user_feedback 行 → 领域类型。 */
function toFeedback(row: typeof userFeedback.$inferSelect): UserFeedback {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as FeedbackKind,
    content: row.content,
    status: row.status as FeedbackStatus,
    ...(row.resolvedBy !== null ? { resolvedBy: row.resolvedBy } : {}),
    ...(row.resolvedAt !== null ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 统计窗口内发起过生成（status 过滤可选）的不同用户数。 */
async function countDistinctUsersWithGeneration(
  db: BailianStudioDb,
  since: Date,
  status: 'any' | 'succeeded',
): Promise<number> {
  const conditions: SQL[] = [gte(generationRecords.createdAt, since), isNull(generationRecords.deletedAt)]
  if (status === 'succeeded') conditions.push(eq(generationRecords.status, 'succeeded'))
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${generationRecords.userId})::int` })
    .from(generationRecords)
    .where(and(...conditions))
  return row?.count ?? 0
}

/** 统计窗口内≥2 个不同自然日发起生成的不同用户数（活跃）。 */
async function countDistinctUsersActiveTwoDays(db: BailianStudioDb, since: Date): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(db.select({ userId: generationRecords.userId })
      .from(generationRecords)
      .where(and(gte(generationRecords.createdAt, since), isNull(generationRecords.deletedAt)))
      .groupBy(generationRecords.userId)
      .having(sql`count(distinct ${generationRecords.createdAt}::date) >= 2`)
      .as('active_users'))
  return row?.count ?? 0
}

/** prompt_library 行 → 领域类型。 */
function toPromptLibraryItem(row: typeof promptLibrary.$inferSelect): PromptLibraryItem {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    modelId: row.modelId,
    prompt: row.prompt,
    params: row.paramsJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 内部辅助。
// ---------------------------------------------------------------------------

type GalleryRow = {
  record: typeof generationRecords.$inferSelect
  authorId: string
  authorDisplayName: string | null
}

/** 画廊列表行：hot 排序时额外携带点赞数（作为排序/游标键）。 */
type GalleryListRow = GalleryRow & { likeCount?: number }

/** 把一批画廊记录行 hydrate 成 GalleryItem（补封面产物、点赞计数、viewer 交互态）。 */
async function hydrateGalleryItems(db: BailianStudioDb, rows: readonly GalleryRow[], viewerId?: string): Promise<GalleryItem[]> {
  if (rows.length === 0) return []

  const recordIds = rows.map(row => row.record.id)

  // 每个记录取首个已存 artifact 作为封面。产物状态是 'stored'
  // （记录才用 'succeeded'，两表枚举不同，见 getGalleryGeneration 注释）。
  const artifactRows = await db
    .select()
    .from(generationArtifacts)
    .where(and(
      inArray(generationArtifacts.recordId, recordIds),
      eq(generationArtifacts.status, 'stored'),
      isNull(generationArtifacts.deletedAt),
    ))
    .orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id))
  const coverByRecord = new Map<string, GenerationArtifact>()
  for (const row of artifactRows) {
    if (!coverByRecord.has(row.recordId)) coverByRecord.set(row.recordId, toGenerationArtifact(row))
  }

  const [likeCounts, likedIds, favoritedIds] = await Promise.all([
    countLikesByRecords(db, recordIds),
    viewerLikedIds(db, viewerId, recordIds),
    viewerFavoritedIds(db, viewerId, recordIds),
  ])

  return rows.map(row => ({
    id: row.record.id,
    modelId: row.record.modelId,
    category: row.record.category as ModelCategory,
    author: { id: row.authorId, displayName: row.authorDisplayName },
    inputParams: row.record.inputParamsJson,
    ...(coverByRecord.get(row.record.id) !== undefined ? { cover: coverByRecord.get(row.record.id) } : {}),
    likeCount: likeCounts.get(row.record.id) ?? 0,
    likedByViewer: likedIds.has(row.record.id),
    favoritedByViewer: favoritedIds.has(row.record.id),
    createdAt: row.record.createdAt.toISOString(),
  }))
}

/** 把一批 admin 画廊行 hydrate 成 AdminGalleryItem（封面 + 点赞数 + 隐藏态）。 */
async function hydrateAdminGalleryItems(db: BailianStudioDb, rows: readonly GalleryRow[]): Promise<AdminGalleryItem[]> {
  if (rows.length === 0) return []

  const recordIds = rows.map(row => row.record.id)
  const artifactRows = await db
    .select()
    .from(generationArtifacts)
    .where(and(
      inArray(generationArtifacts.recordId, recordIds),
      eq(generationArtifacts.status, 'stored'),
      isNull(generationArtifacts.deletedAt),
    ))
    .orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id))
  const coverByRecord = new Map<string, GenerationArtifact>()
  for (const row of artifactRows) {
    if (!coverByRecord.has(row.recordId)) coverByRecord.set(row.recordId, toGenerationArtifact(row))
  }

  const likeCounts = await countLikesByRecords(db, recordIds)

  return rows.map(row => ({
    id: row.record.id,
    modelId: row.record.modelId,
    category: row.record.category as ModelCategory,
    author: { id: row.authorId, displayName: row.authorDisplayName },
    ...(coverByRecord.get(row.record.id) !== undefined ? { cover: coverByRecord.get(row.record.id) } : {}),
    likeCount: likeCounts.get(row.record.id) ?? 0,
    visibility: row.record.visibility as GalleryVisibility,
    status: row.record.status,
    ...(row.record.hiddenAt !== null
      ? { hiddenAt: row.record.hiddenAt.toISOString(), hiddenBy: row.record.hiddenBy ?? undefined }
      : {}),
    createdAt: row.record.createdAt.toISOString(),
  }))
}

/** 批量统计点赞数：recordId → count。 */
async function countLikesByRecords(db: BailianStudioDb, recordIds: readonly string[]): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map()
  const rows = await db
    .select({ recordId: generationLikes.recordId, count: sql<number>`count(*)::int` })
    .from(generationLikes)
    .where(inArray(generationLikes.recordId, recordIds))
    .groupBy(generationLikes.recordId)
  return new Map(rows.map(row => [row.recordId, row.count]))
}

/** viewer 是否已赞单条记录（recordIds 为空 → false）。 */
async function viewerLiked(db: BailianStudioDb, viewerId: string | undefined, recordIds: readonly string[]): Promise<boolean> {
  const first = recordIds[0]
  return first !== undefined && (await viewerLikedIds(db, viewerId, recordIds)).has(first)
}

/** viewer 是否已收藏单条记录（recordIds 为空 → false）。 */
async function viewerFavorited(db: BailianStudioDb, viewerId: string | undefined, recordIds: readonly string[]): Promise<boolean> {
  const first = recordIds[0]
  return first !== undefined && (await viewerFavoritedIds(db, viewerId, recordIds)).has(first)
}

async function viewerLikedIds(db: BailianStudioDb, viewerId: string | undefined, recordIds: readonly string[]): Promise<Set<string>> {
  if (viewerId === undefined || recordIds.length === 0) return new Set()
  const rows = await db
    .select({ recordId: generationLikes.recordId })
    .from(generationLikes)
    .where(and(
      eq(generationLikes.userId, viewerId),
      inArray(generationLikes.recordId, recordIds),
    ))
  return new Set(rows.map(row => row.recordId))
}

async function viewerFavoritedIds(db: BailianStudioDb, viewerId: string | undefined, recordIds: readonly string[]): Promise<Set<string>> {
  if (viewerId === undefined || recordIds.length === 0) return new Set()
  const rows = await db
    .select({ recordId: generationFavorites.recordId })
    .from(generationFavorites)
    .where(and(
      eq(generationFavorites.userId, viewerId),
      inArray(generationFavorites.recordId, recordIds),
    ))
  return new Set(rows.map(row => row.recordId))
}

/** 记录是否对所有人公开可见（画廊候选；作者被封禁/删除则视为不可见）。 */
async function isPublicVisible(db: BailianStudioDb, recordId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: generationRecords.id })
    .from(generationRecords)
    .innerJoin(users, and(eq(users.id, generationRecords.userId), isNull(users.bannedAt), isNull(users.deletedAt)))
    .where(and(
      eq(generationRecords.id, recordId),
      eq(generationRecords.visibility, 'public'),
      eq(generationRecords.status, 'succeeded'),
      isNull(generationRecords.deletedAt),
      isNull(generationRecords.hiddenAt),
    ))
    .limit(1)
  return row !== undefined
}

/** 记录对某 viewer 是否可见：自己的未删记录，或公开成功未藏记录（作者被封禁/删除则不可见）。 */
async function isVisibleToViewer(db: BailianStudioDb, recordId: string, viewerId: string): Promise<boolean> {
  const [row] = await db
    .select({
      userId: generationRecords.userId,
      visibility: generationRecords.visibility,
      status: generationRecords.status,
      deletedAt: generationRecords.deletedAt,
      hiddenAt: generationRecords.hiddenAt,
      authorBannedAt: users.bannedAt,
      authorDeletedAt: users.deletedAt,
    })
    .from(generationRecords)
    .innerJoin(users, eq(users.id, generationRecords.userId))
    .where(eq(generationRecords.id, recordId))
    .limit(1)
  if (row === undefined || row.deletedAt !== null) return false
  if (row.authorBannedAt !== null || row.authorDeletedAt !== null) return false
  if (row.userId === viewerId) return true
  return row.visibility === 'public' && row.status === 'succeeded' && row.hiddenAt === null
}

/** 画廊详情记录投影：剥离 owner/cost/task/provider/outputResult（镜像 share 投影）。 */
function toPublicGalleryRecord(record: import('./types').GenerationRecord): import('./types').PublicSharedGenerationRecord {
  return {
    id: record.id,
    modelId: record.modelId,
    provider: record.provider,
    providerModel: record.providerModel,
    category: record.category,
    inputParams: record.inputParams,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
