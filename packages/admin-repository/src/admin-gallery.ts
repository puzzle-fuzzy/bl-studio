/**
 * 管理画廊持久化接缝：后台查询、预览、隐藏/恢复、软删除和封禁联动。
 *
 * 这里允许读取已隐藏作品，和面向用户的 SocialRepository 有意保持不同的
 * 可见性策略。举报 repository 只负责举报本身；举报后的下架由 API 显式调用
 * 本模块，跨域治理动作不会隐式发生。
 */
import {
	type BailianStudioDb,
	generationArtifacts,
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
	isNotNull,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { AdminRepositoryError } from "./errors";
import { toGenerationArtifact } from "./mappers";
import type {
	AdminGalleryItem,
	GalleryVisibility,
	GenerationArtifact,
	ListAdminGalleryResult,
} from "./types";

export interface AdminGalleryRepository {
	listAdminGalleryGenerations(input: {
		cursor?: string;
		limit?: number;
		includeHidden?: boolean;
		q?: string;
		authorId?: string;
	}): Promise<ListAdminGalleryResult>;
	getAdminGalleryArtifact(input: {
		recordId: string;
		artifactId: string;
	}): Promise<GenerationArtifact | undefined>;
	listAdminGalleryRecordArtifacts(input: {
		recordId: string;
	}): Promise<GenerationArtifact[]>;
	setGalleryRecordHidden(input: {
		recordId: string;
		hidden: boolean;
		actorId: string;
	}): Promise<void>;
	setGalleryRecordsHidden(input: {
		recordIds: string[];
		hidden: boolean;
		actorId: string;
	}): Promise<string[]>;
	softDeleteGalleryRecords(input: {
		recordIds: string[];
		actorId: string;
	}): Promise<string[]>;
	hideUserPublicWorks(input: {
		userId: string;
		actorId: string;
	}): Promise<number>;
}

export function createAdminGalleryRepository(
	db: BailianStudioDb,
): AdminGalleryRepository {
	async function listAdminGalleryGenerations(input: {
		cursor?: string;
		limit?: number;
		includeHidden?: boolean;
		q?: string;
		authorId?: string;
	}): Promise<ListAdminGalleryResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const conditions: SQL[] = [
			eq(generationRecords.visibility, "public"),
			eq(generationRecords.status, "succeeded"),
			isNull(generationRecords.deletedAt),
		];
		if (input.includeHidden !== true) {
			conditions.push(isNull(generationRecords.hiddenAt));
		}
		if (input.authorId !== undefined) {
			conditions.push(eq(generationRecords.userId, input.authorId));
		}
		if (input.q !== undefined && input.q.length > 0) {
			conditions.push(
				ilike(sql`${generationRecords.inputParamsJson}::text`, `%${input.q}%`),
			);
		}
		if (cursor !== undefined) {
			conditions.push(
				sql`(${generationRecords.createdAt} < ${cursor.createdAt} OR (${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id}))`,
			);
		}

		const rows = await db
			.select({
				record: generationRecords,
				authorId: users.id,
				authorDisplayName: users.displayName,
			})
			.from(generationRecords)
			.innerJoin(
				users,
				and(eq(users.id, generationRecords.userId), isNull(users.deletedAt)),
			)
			.where(and(...conditions))
			.orderBy(desc(generationRecords.createdAt), desc(generationRecords.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		const items = await hydrateAdminGalleryItems(db, page);

		return {
			items,
			...(hasMore && last !== undefined
				? {
						nextCursor: encodeCursor({
							createdAt: last.record.createdAt.toISOString(),
							id: last.record.id,
						}),
					}
				: {}),
		};
	}

	async function getAdminGalleryArtifact(input: {
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
			.where(
				and(
					eq(generationArtifacts.id, input.artifactId),
					eq(generationArtifacts.recordId, input.recordId),
					eq(generationArtifacts.status, "stored"),
					isNull(generationArtifacts.deletedAt),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
				),
			)
			.limit(1);
		return row === undefined ? undefined : toGenerationArtifact(row.artifact);
	}

	async function listAdminGalleryRecordArtifacts(input: {
		recordId: string;
	}): Promise<GenerationArtifact[]> {
		const rows = await db
			.select({ artifact: generationArtifacts })
			.from(generationArtifacts)
			.innerJoin(
				generationRecords,
				eq(generationRecords.id, generationArtifacts.recordId),
			)
			.where(
				and(
					eq(generationArtifacts.recordId, input.recordId),
					eq(generationArtifacts.status, "stored"),
					isNull(generationArtifacts.deletedAt),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
				),
			)
			.orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id));
		return rows.map((row) => toGenerationArtifact(row.artifact));
	}

	async function setGalleryRecordHidden(input: {
		recordId: string;
		hidden: boolean;
		actorId: string;
	}): Promise<void> {
		const now = new Date();
		const [row] = await db
			.update(generationRecords)
			.set(
				input.hidden
					? {
							hiddenAt: now,
							hiddenBy: input.actorId,
							updatedAt: now,
							updatedBy: input.actorId,
						}
					: {
							hiddenAt: null,
							hiddenBy: null,
							updatedAt: now,
							updatedBy: input.actorId,
						},
			)
			.where(
				and(
					eq(generationRecords.id, input.recordId),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
				),
			)
			.returning({ id: generationRecords.id });
		if (row === undefined) {
			throw new AdminRepositoryError(
					"ADMIN_GENERATION_NOT_FOUND",
				`Generation not found: ${input.recordId}`,
			);
		}
	}

	async function setGalleryRecordsHidden(input: {
		recordIds: string[];
		hidden: boolean;
		actorId: string;
	}): Promise<string[]> {
		if (input.recordIds.length === 0) return [];
		const now = new Date();
		const rows = await db
			.update(generationRecords)
			.set(
				input.hidden
					? {
							hiddenAt: now,
							hiddenBy: input.actorId,
							updatedAt: now,
							updatedBy: input.actorId,
						}
					: {
							hiddenAt: null,
							hiddenBy: null,
							updatedAt: now,
							updatedBy: input.actorId,
						},
			)
			.where(
				and(
					inArray(generationRecords.id, input.recordIds),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
					input.hidden
						? isNull(generationRecords.hiddenAt)
						: isNotNull(generationRecords.hiddenAt),
				),
			)
			.returning({ id: generationRecords.id });
		return rows.map((row) => row.id);
	}

	async function softDeleteGalleryRecords(input: {
		recordIds: string[];
		actorId: string;
	}): Promise<string[]> {
		if (input.recordIds.length === 0) return [];
		const now = new Date();
		const rows = await db
			.update(generationRecords)
			.set({
				deletedAt: now,
				deletedBy: input.actorId,
				updatedAt: now,
				updatedBy: input.actorId,
			})
			.where(
				and(
					inArray(generationRecords.id, input.recordIds),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
				),
			)
			.returning({ id: generationRecords.id });
		return rows.map((row) => row.id);
	}

	async function hideUserPublicWorks(input: {
		userId: string;
		actorId: string;
	}): Promise<number> {
		const now = new Date();
		const rows = await db
			.update(generationRecords)
			.set({
				hiddenAt: now,
				hiddenBy: input.actorId,
				updatedAt: now,
				updatedBy: input.actorId,
			})
			.where(
				and(
					eq(generationRecords.userId, input.userId),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
					isNull(generationRecords.hiddenAt),
				),
			)
			.returning({ id: generationRecords.id });
		return rows.length;
	}

	return {
		listAdminGalleryGenerations,
		getAdminGalleryArtifact,
		listAdminGalleryRecordArtifacts,
		setGalleryRecordHidden,
		setGalleryRecordsHidden,
		softDeleteGalleryRecords,
		hideUserPublicWorks,
	};
}

type GalleryRow = {
	record: typeof generationRecords.$inferSelect;
	authorId: string;
	authorDisplayName: string | null;
};

async function hydrateAdminGalleryItems(
	db: BailianStudioDb,
	rows: readonly GalleryRow[],
): Promise<AdminGalleryItem[]> {
	if (rows.length === 0) return [];

	const recordIds = rows.map((row) => row.record.id);
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
		if (!coverByRecord.has(row.recordId)) {
			coverByRecord.set(row.recordId, toGenerationArtifact(row));
		}
	}

	const likeCounts = await countLikesByRecords(db, recordIds);

	return rows.map((row) => ({
		id: row.record.id,
		modelId: row.record.modelId,
		category: row.record.category as ModelCategory,
		author: { id: row.authorId, displayName: row.authorDisplayName },
		...(coverByRecord.get(row.record.id) !== undefined
			? { cover: coverByRecord.get(row.record.id) }
			: {}),
		likeCount: likeCounts.get(row.record.id) ?? 0,
		visibility: row.record.visibility as GalleryVisibility,
		status: row.record.status,
		...(row.record.hiddenAt !== null
			? {
					hiddenAt: row.record.hiddenAt.toISOString(),
					hiddenBy: row.record.hiddenBy ?? undefined,
				}
			: {}),
		createdAt: row.record.createdAt.toISOString(),
	}));
}

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
