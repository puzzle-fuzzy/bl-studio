/**
 * 社交/画廊持久化接缝：作品可见性、画廊列表/详情、收藏与点赞。
 *
 * 这个模块拥有 gallery/social 的查询和状态写入。API 依赖窄 port，后续可以在
 * 不改 API 路由的情况下把本模块移动到独立 social-repository 包。
 *
 * 可见性不变量（与 API 层约定）：
 *  - 画廊列表/详情/产物只暴露 visibility='public' 且 status='succeeded'、
 *    未删未藏的记录；
 *  - 点赞仅对公开可见记录；
 *  - 收藏对“本人可见”的记录（自己的任意未删记录，或公开成功记录）；
 *  - 越权访问统一按 GENERATION_NOT_FOUND 处理（IDOR 模式：不存在与不可见同响应）。
 */

import {
	type BailianStudioDb,
	generationArtifacts,
	generationFavorites,
	generationLikes,
	generationRecords,
	users,
} from "@bailian-studio/db";
import type { ModelCategory } from "@bailian-studio/model-core";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { GenerationRepositoryError } from "./errors";
import { toGenerationArtifact, toGenerationRecord } from "./mappers";
import type {
	GalleryDetail,
	GalleryItem,
	GallerySort,
	GalleryVisibility,
	GenerationArtifact,
	GenerationRecord,
	ListGalleryResult,
	PublicSharedGenerationRecord,
} from "./types";

export interface SocialRepository {
	setGenerationVisibility(input: {
		userId: string;
		recordId: string;
		visibility: GalleryVisibility;
		now?: string;
	}): Promise<GenerationRecord>;
	listGalleryGenerations(input: {
		cursor?: string;
		limit?: number;
		category?: ModelCategory;
		modelId?: string;
		authorId?: string;
		q?: string;
		sort?: GallerySort;
		viewerId?: string;
	}): Promise<ListGalleryResult>;
	getGalleryGeneration(input: {
		recordId: string;
		viewerId?: string;
	}): Promise<GalleryDetail | undefined>;
	getGalleryArtifact(input: {
		recordId: string;
		artifactId: string;
	}): Promise<GenerationArtifact | undefined>;
	setGenerationLike(input: {
		userId: string;
		recordId: string;
		liked: boolean;
	}): Promise<{ liked: boolean; likeCount: number }>;
	setGenerationFavorite(input: {
		userId: string;
		recordId: string;
		favorited: boolean;
	}): Promise<{ favorited: boolean }>;
	getGenerationFavorited(input: {
		userId: string;
		recordId: string;
	}): Promise<boolean | undefined>;
	listGenerationFavorites(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListGalleryResult>;
}

function nowIso(): string {
	return new Date().toISOString();
}

export function createSocialRepository(db: BailianStudioDb): SocialRepository {
	async function setGenerationVisibility(input: {
		userId: string;
		recordId: string;
		visibility: GalleryVisibility;
		now?: string;
	}): Promise<GenerationRecord> {
		const changedAt = new Date(input.now ?? nowIso());
		const [row] = await db
			.update(generationRecords)
			.set({
				visibility: input.visibility,
				updatedAt: changedAt,
				updatedBy: input.userId,
			})
			.where(
				and(
					eq(generationRecords.id, input.recordId),
					eq(generationRecords.userId, input.userId),
				),
			)
			.returning();

		if (row === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Generation not found: ${input.recordId}`,
			);
		}
		return toGenerationRecord(row);
	}

	async function listGalleryGenerations(input: {
		cursor?: string;
		limit?: number;
		category?: ModelCategory;
		modelId?: string;
		authorId?: string;
		q?: string;
		sort?: GallerySort;
		viewerId?: string;
	}): Promise<ListGalleryResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const hot = input.sort === "hot";

		const conditions: SQL[] = [
			eq(generationRecords.visibility, "public"),
			eq(generationRecords.status, "succeeded"),
			isNull(generationRecords.deletedAt),
			isNull(generationRecords.hiddenAt),
		];
		if (input.category !== undefined)
			conditions.push(eq(generationRecords.category, input.category));
		if (input.modelId !== undefined)
			conditions.push(eq(generationRecords.modelId, input.modelId));
		if (input.authorId !== undefined)
			conditions.push(eq(generationRecords.userId, input.authorId));
		if (input.q !== undefined && input.q.length > 0) {
			// 参数正文（含 prompt）整体按文本搜索；画廊量级小，::text ilike 可接受。
			conditions.push(
				ilike(sql`${generationRecords.inputParamsJson}::text`, `%${input.q}%`),
			);
		}

		// hot 排序需要每行点赞数作为排序/游标键（无赞按 0 处理）。
		const likeCountSub = hot
			? db
					.select({
						recordId: generationLikes.recordId,
						likeCount: sql<number>`count(*)::int`.as("like_count"),
					})
					.from(generationLikes)
					.groupBy(generationLikes.recordId)
					.as("gallery_like_count")
			: undefined;
		const likeCountExpr =
			likeCountSub !== undefined
				? sql<number>`coalesce(${likeCountSub.likeCount}, 0)::int`
				: undefined;

		if (cursor !== undefined) {
			if (hot) {
				const likeCount = cursor.likeCount ?? 0;
				conditions.push(sql`(
					${likeCountExpr} < ${likeCount}
					OR (${likeCountExpr} = ${likeCount} AND ${generationRecords.createdAt} < ${cursor.createdAt})
					OR (${likeCountExpr} = ${likeCount} AND ${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id})
				)`);
			} else {
				conditions.push(
					sql`(${generationRecords.createdAt} < ${cursor.createdAt} OR (${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id}))`,
				);
			}
		}

		let rows: GalleryListRow[];
		if (hot) {
			if (likeCountSub === undefined || likeCountExpr === undefined) {
				throw new Error("Hot gallery query is missing like-count expressions");
			}
			rows = await db
				.select({
					record: generationRecords,
					authorId: users.id,
					authorDisplayName: users.displayName,
					likeCount: likeCountExpr,
				})
				.from(generationRecords)
				.innerJoin(
					users,
					and(
						eq(users.id, generationRecords.userId),
						isNull(users.bannedAt),
						isNull(users.deletedAt),
					),
				)
				.leftJoin(likeCountSub, eq(likeCountSub.recordId, generationRecords.id))
				.where(and(...conditions))
				.orderBy(
					desc(likeCountExpr),
					desc(generationRecords.createdAt),
					desc(generationRecords.id),
				)
				.limit(limit + 1);
		} else {
			rows = await db
				.select({
					record: generationRecords,
					authorId: users.id,
					authorDisplayName: users.displayName,
				})
				.from(generationRecords)
				.innerJoin(
					users,
					and(
						eq(users.id, generationRecords.userId),
						isNull(users.bannedAt),
						isNull(users.deletedAt),
					),
				)
				.where(and(...conditions))
				.orderBy(desc(generationRecords.createdAt), desc(generationRecords.id))
				.limit(limit + 1);
		}

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		const items = await hydrateGalleryItems(db, page, input.viewerId);

		return {
			items,
			...(hasMore && last !== undefined
				? {
						nextCursor: encodeCursor(
							hot
								? {
										likeCount: last.likeCount ?? 0,
										createdAt: last.record.createdAt.toISOString(),
										id: last.record.id,
									}
								: {
										createdAt: last.record.createdAt.toISOString(),
										id: last.record.id,
									},
						),
					}
				: {}),
		};
	}

	async function getGalleryGeneration(input: {
		recordId: string;
		viewerId?: string;
	}): Promise<GalleryDetail | undefined> {
		const [row] = await db
			.select({
				record: generationRecords,
				authorId: users.id,
				authorDisplayName: users.displayName,
			})
			.from(generationRecords)
			.innerJoin(
				users,
				and(
					eq(users.id, generationRecords.userId),
					isNull(users.bannedAt),
					isNull(users.deletedAt),
				),
			)
			.where(
				and(
					eq(generationRecords.id, input.recordId),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
					isNull(generationRecords.hiddenAt),
				),
			)
			.limit(1);

		if (row === undefined) return undefined;

		const record = toGenerationRecord(row.record);
		// 注意：这里过滤的是“产物持久化状态”（pending|stored|failed），不是记录状态。
		// generation_records 用 'succeeded'，generation_artifacts 用 'stored'——别写混。
		const artifactRows = await db
			.select()
			.from(generationArtifacts)
			.where(
				and(
					eq(generationArtifacts.recordId, input.recordId),
					eq(generationArtifacts.status, "stored"),
					isNull(generationArtifacts.deletedAt),
				),
			)
			.orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id));
		const artifacts = artifactRows.map(toGenerationArtifact);
		const [likeCount, liked, favorited] = await Promise.all([
			countLikesByRecords(db, [input.recordId]).then(
				(map) => map.get(input.recordId) ?? 0,
			),
			viewerLiked(db, input.viewerId, [input.recordId]),
			viewerFavorited(db, input.viewerId, [input.recordId]),
		]);

		return {
			record: toPublicGalleryRecord(record),
			artifacts,
			author: { id: row.authorId, displayName: row.authorDisplayName },
			likeCount,
			likedByViewer: liked,
			favoritedByViewer: favorited,
		};
	}

	/** 画廊跨用户产物：同时校验产物与父记录都公开可见（不存在/不可见统一 undefined）。 */
	async function getGalleryArtifact(input: {
		recordId: string;
		artifactId: string;
	}): Promise<GenerationArtifact | undefined> {
		const [row] = await db
			.select({ artifact: generationArtifacts })
			.from(generationArtifacts)
			.innerJoin(
				generationRecords,
				eq(generationRecords.id, generationArtifacts.recordId),
			)
			.innerJoin(
				users,
				and(
					eq(users.id, generationRecords.userId),
					isNull(users.bannedAt),
					isNull(users.deletedAt),
				),
			)
			.where(
				and(
					eq(generationArtifacts.id, input.artifactId),
					eq(generationArtifacts.recordId, input.recordId),
					// 产物用 'stored'（不是记录的 'succeeded'，见 getGalleryGeneration 注释）。
					eq(generationArtifacts.status, "stored"),
					isNull(generationArtifacts.deletedAt),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
					isNull(generationRecords.hiddenAt),
				),
			)
			.limit(1);
		return row === undefined ? undefined : toGenerationArtifact(row.artifact);
	}

	async function setGenerationLike(input: {
		userId: string;
		recordId: string;
		liked: boolean;
	}): Promise<{ liked: boolean; likeCount: number }> {
		if (!(await isPublicVisible(db, input.recordId))) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Generation not found: ${input.recordId}`,
			);
		}
		if (input.liked) {
			await db
				.insert(generationLikes)
				.values({
					recordId: input.recordId,
					userId: input.userId,
					createdAt: new Date(),
				})
				.onConflictDoNothing({
					target: [generationLikes.recordId, generationLikes.userId],
				});
		} else {
			await db
				.delete(generationLikes)
				.where(
					and(
						eq(generationLikes.recordId, input.recordId),
						eq(generationLikes.userId, input.userId),
					),
				);
		}
		const likeCount =
			(await countLikesByRecords(db, [input.recordId])).get(input.recordId) ??
			0;
		return { liked: input.liked, likeCount };
	}

	async function setGenerationFavorite(input: {
		userId: string;
		recordId: string;
		favorited: boolean;
	}): Promise<{ favorited: boolean }> {
		if (!(await isVisibleToViewer(db, input.recordId, input.userId))) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Generation not found: ${input.recordId}`,
			);
		}
		if (input.favorited) {
			await db
				.insert(generationFavorites)
				.values({
					recordId: input.recordId,
					userId: input.userId,
					createdAt: new Date(),
				})
				.onConflictDoNothing({
					target: [generationFavorites.recordId, generationFavorites.userId],
				});
		} else {
			await db
				.delete(generationFavorites)
				.where(
					and(
						eq(generationFavorites.recordId, input.recordId),
						eq(generationFavorites.userId, input.userId),
					),
				);
		}
		return { favorited: input.favorited };
	}

	async function getGenerationFavorited(input: {
		userId: string;
		recordId: string;
	}): Promise<boolean | undefined> {
		if (!(await isVisibleToViewer(db, input.recordId, input.userId)))
			return undefined;
		const [row] = await db
			.select({ recordId: generationFavorites.recordId })
			.from(generationFavorites)
			.where(
				and(
					eq(generationFavorites.recordId, input.recordId),
					eq(generationFavorites.userId, input.userId),
				),
			)
			.limit(1);
		return row !== undefined;
	}

	/** 我的收藏：按收藏时间倒序（favorites.createdAt 为游标排序键）。 */
	async function listGenerationFavorites(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListGalleryResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const conditions: SQL[] = [
			eq(generationFavorites.userId, input.userId),
			isNull(generationRecords.deletedAt),
			// 与详情可见性一致：作者隐藏（hiddenAt）或封禁/删除后从收藏列表消失，
			// 避免列表可见但详情 404 的不一致（回归：见计划文档 §1.3）。
			isNull(generationRecords.hiddenAt),
			sql`(${generationRecords.userId} = ${input.userId} OR (${generationRecords.visibility} = 'public' AND ${generationRecords.status} = 'succeeded'))`,
		];
		if (cursor !== undefined) {
			conditions.push(
				sql`(${generationFavorites.createdAt} < ${cursor.createdAt} OR (${generationFavorites.createdAt} = ${cursor.createdAt} AND ${generationFavorites.recordId} < ${cursor.id}))`,
			);
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
			.innerJoin(
				generationRecords,
				eq(generationRecords.id, generationFavorites.recordId),
			)
			.innerJoin(
				users,
				and(
					eq(users.id, generationRecords.userId),
					isNull(users.bannedAt),
					isNull(users.deletedAt),
				),
			)
			.where(and(...conditions))
			// 游标排序键必须是“收藏时间”（favorites.createdAt），不能用作品创建时间
			// 编码——否则第二页恒空（收藏必然晚于创建）。次级键补 recordId 保证同毫秒稳定。
			.orderBy(
				desc(generationFavorites.createdAt),
				desc(generationFavorites.recordId),
			)
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		const items = await hydrateGalleryItems(db, page, input.userId);

		return {
			items,
			...(hasMore && last !== undefined
				? {
						nextCursor: encodeCursor({
							createdAt: last.favoriteCreatedAt.toISOString(),
							id: last.favoriteRecordId,
						}),
					}
				: {}),
		};
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
	};
}

type GalleryRow = {
	record: typeof generationRecords.$inferSelect;
	authorId: string;
	authorDisplayName: string | null;
};

/** 画廊列表行：hot 排序时额外携带点赞数（作为排序/游标键）。 */
type GalleryListRow = GalleryRow & { likeCount?: number };

/** 把一批画廊记录行 hydrate 成 GalleryItem（补封面产物、点赞计数、viewer 交互态）。 */
async function hydrateGalleryItems(
	db: BailianStudioDb,
	rows: readonly GalleryRow[],
	viewerId?: string,
): Promise<GalleryItem[]> {
	if (rows.length === 0) return [];

	const recordIds = rows.map((row) => row.record.id);
	// 每个记录取首个已存 artifact 作为封面。产物状态是 'stored'。
	const artifactRows = await db
		.select()
		.from(generationArtifacts)
		.where(
			and(
				inArray(generationArtifacts.recordId, recordIds),
				eq(generationArtifacts.status, "stored"),
				isNull(generationArtifacts.deletedAt),
			),
		)
		.orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id));
	const coverByRecord = new Map<string, GenerationArtifact>();
	for (const row of artifactRows) {
		if (!coverByRecord.has(row.recordId))
			coverByRecord.set(row.recordId, toGenerationArtifact(row));
	}

	const [likeCounts, likedIds, favoritedIds] = await Promise.all([
		countLikesByRecords(db, recordIds),
		viewerLikedIds(db, viewerId, recordIds),
		viewerFavoritedIds(db, viewerId, recordIds),
	]);

	return rows.map((row) => ({
		id: row.record.id,
		modelId: row.record.modelId,
		category: row.record.category as ModelCategory,
		author: { id: row.authorId, displayName: row.authorDisplayName },
		inputParams: row.record.inputParamsJson,
		...(coverByRecord.get(row.record.id) !== undefined
			? { cover: coverByRecord.get(row.record.id) }
			: {}),
		likeCount: likeCounts.get(row.record.id) ?? 0,
		likedByViewer: likedIds.has(row.record.id),
		favoritedByViewer: favoritedIds.has(row.record.id),
		createdAt: row.record.createdAt.toISOString(),
	}));
}

/** 批量统计点赞数：recordId → count。 */
async function countLikesByRecords(
	db: BailianStudioDb,
	recordIds: readonly string[],
): Promise<Map<string, number>> {
	if (recordIds.length === 0) return new Map();
	const rows = await db
		.select({
			recordId: generationLikes.recordId,
			count: sql<number>`count(*)::int`,
		})
		.from(generationLikes)
		.where(inArray(generationLikes.recordId, recordIds))
		.groupBy(generationLikes.recordId);
	return new Map(rows.map((row) => [row.recordId, row.count]));
}

/** viewer 是否已赞单条记录（recordIds 为空 → false）。 */
async function viewerLiked(
	db: BailianStudioDb,
	viewerId: string | undefined,
	recordIds: readonly string[],
): Promise<boolean> {
	const first = recordIds[0];
	return (
		first !== undefined &&
		(await viewerLikedIds(db, viewerId, recordIds)).has(first)
	);
}

/** viewer 是否已收藏单条记录（recordIds 为空 → false）。 */
async function viewerFavorited(
	db: BailianStudioDb,
	viewerId: string | undefined,
	recordIds: readonly string[],
): Promise<boolean> {
	const first = recordIds[0];
	return (
		first !== undefined &&
		(await viewerFavoritedIds(db, viewerId, recordIds)).has(first)
	);
}

async function viewerLikedIds(
	db: BailianStudioDb,
	viewerId: string | undefined,
	recordIds: readonly string[],
): Promise<Set<string>> {
	if (viewerId === undefined || recordIds.length === 0) return new Set();
	const rows = await db
		.select({ recordId: generationLikes.recordId })
		.from(generationLikes)
		.where(
			and(
				eq(generationLikes.userId, viewerId),
				inArray(generationLikes.recordId, recordIds),
			),
		);
	return new Set(rows.map((row) => row.recordId));
}

async function viewerFavoritedIds(
	db: BailianStudioDb,
	viewerId: string | undefined,
	recordIds: readonly string[],
): Promise<Set<string>> {
	if (viewerId === undefined || recordIds.length === 0) return new Set();
	const rows = await db
		.select({ recordId: generationFavorites.recordId })
		.from(generationFavorites)
		.where(
			and(
				eq(generationFavorites.userId, viewerId),
				inArray(generationFavorites.recordId, recordIds),
			),
		);
	return new Set(rows.map((row) => row.recordId));
}

/** 记录是否对所有人公开可见（画廊候选；作者被封禁/删除则视为不可见）。 */
async function isPublicVisible(
	db: BailianStudioDb,
	recordId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: generationRecords.id })
		.from(generationRecords)
		.innerJoin(
			users,
			and(
				eq(users.id, generationRecords.userId),
				isNull(users.bannedAt),
				isNull(users.deletedAt),
			),
		)
		.where(
			and(
				eq(generationRecords.id, recordId),
				eq(generationRecords.visibility, "public"),
				eq(generationRecords.status, "succeeded"),
				isNull(generationRecords.deletedAt),
				isNull(generationRecords.hiddenAt),
			),
		)
		.limit(1);
	return row !== undefined;
}

/** 记录对某 viewer 是否可见：自己的未删记录，或公开成功未藏记录（作者被封禁/删除则不可见）。 */
async function isVisibleToViewer(
	db: BailianStudioDb,
	recordId: string,
	viewerId: string,
): Promise<boolean> {
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
		.limit(1);
	if (row === undefined || row.deletedAt !== null) return false;
	if (row.authorBannedAt !== null || row.authorDeletedAt !== null) return false;
	if (row.userId === viewerId) return true;
	return (
		row.visibility === "public" &&
		row.status === "succeeded" &&
		row.hiddenAt === null
	);
}

/** 画廊详情记录投影：剥离 owner/cost/task/provider/outputResult（镜像 share 投影）。 */
function toPublicGalleryRecord(
	record: GenerationRecord,
): PublicSharedGenerationRecord {
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
	};
}
