/**
 * 提示词资产库持久化接缝：用户命名提示词的增删改查。
 *
 * 这个模块拥有 prompt_library 的查询和软删除，API 只依赖这个窄 port。
 * 文本参数保留 JSON 形态，媒体/参考图
 * 不进入该跨设备复用的轻量资产库。
 */
import { randomUUID } from "node:crypto";
import { type BailianStudioDb, promptLibrary } from "@bailian-studio/db";
import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { GenerationRepositoryError } from "./errors";
import type { ListPromptLibraryResult, PromptLibraryItem } from "./types";

export interface PromptLibraryRepository {
	listPromptLibrary(input: {
		userId: string;
		cursor?: string;
		limit?: number;
		q?: string;
	}): Promise<ListPromptLibraryResult>;
	createPromptLibraryItem(input: {
		userId: string;
		name: string;
		modelId: string;
		prompt: string;
		params: Record<string, unknown>;
	}): Promise<PromptLibraryItem>;
	updatePromptLibraryItem(input: {
		userId: string;
		itemId: string;
		name?: string;
		prompt?: string;
		params?: Record<string, unknown>;
	}): Promise<PromptLibraryItem>;
	deletePromptLibraryItem(input: {
		userId: string;
		itemId: string;
	}): Promise<void>;
}

export function createPromptLibraryRepository(
	db: BailianStudioDb,
): PromptLibraryRepository {
	async function listPromptLibrary(input: {
		userId: string;
		cursor?: string;
		limit?: number;
		q?: string;
	}): Promise<ListPromptLibraryResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;

		const conditions: SQL[] = [
			eq(promptLibrary.userId, input.userId),
			isNull(promptLibrary.deletedAt),
		];
		if (input.q !== undefined && input.q.length > 0) {
			const pattern = `%${input.q}%`;
			const match = or(
				ilike(promptLibrary.name, pattern),
				ilike(promptLibrary.prompt, pattern),
			);
			if (match !== undefined) conditions.push(match);
		}
		if (cursor !== undefined) {
			conditions.push(
				sql`(${promptLibrary.updatedAt} < ${cursor.createdAt} OR (${promptLibrary.updatedAt} = ${cursor.createdAt} AND ${promptLibrary.id} < ${cursor.id}))`,
			);
		}

		const rows = await db
			.select()
			.from(promptLibrary)
			.where(and(...conditions))
			.orderBy(desc(promptLibrary.updatedAt), desc(promptLibrary.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];

		return {
			items: page.map(toPromptLibraryItem),
			...(hasMore && last !== undefined
				? {
						nextCursor: encodeCursor({
							createdAt: last.updatedAt.toISOString(),
							id: last.id,
						}),
					}
				: {}),
		};
	}

	async function createPromptLibraryItem(input: {
		userId: string;
		name: string;
		modelId: string;
		prompt: string;
		params: Record<string, unknown>;
	}): Promise<PromptLibraryItem> {
		const now = new Date();
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
			.returning();
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"DATABASE_ERROR",
				"Failed to create prompt library item",
			);
		}
		return toPromptLibraryItem(row);
	}

	async function updatePromptLibraryItem(input: {
		userId: string;
		itemId: string;
		name?: string;
		prompt?: string;
		params?: Record<string, unknown>;
	}): Promise<PromptLibraryItem> {
		const patch: Record<string, unknown> = {
			updatedAt: new Date(),
			updatedBy: input.userId,
		};
		if (input.name !== undefined) patch.name = input.name;
		if (input.prompt !== undefined) patch.prompt = input.prompt;
		if (input.params !== undefined) patch.paramsJson = input.params;

		const [row] = await db
			.update(promptLibrary)
			.set(patch)
			.where(
				and(
					eq(promptLibrary.id, input.itemId),
					eq(promptLibrary.userId, input.userId),
					isNull(promptLibrary.deletedAt),
				),
			)
			.returning();
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Prompt library item not found: ${input.itemId}`,
			);
		}
		return toPromptLibraryItem(row);
	}

	async function deletePromptLibraryItem(input: {
		userId: string;
		itemId: string;
	}): Promise<void> {
		const now = new Date();
		const [row] = await db
			.update(promptLibrary)
			.set({
				deletedAt: now,
				deletedBy: input.userId,
				updatedAt: now,
				updatedBy: input.userId,
			})
			.where(
				and(
					eq(promptLibrary.id, input.itemId),
					eq(promptLibrary.userId, input.userId),
					isNull(promptLibrary.deletedAt),
				),
			)
			.returning({ id: promptLibrary.id });
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Prompt library item not found: ${input.itemId}`,
			);
		}
	}

	return {
		listPromptLibrary,
		createPromptLibraryItem,
		updatePromptLibraryItem,
		deletePromptLibraryItem,
	};
}

function toPromptLibraryItem(
	row: typeof promptLibrary.$inferSelect,
): PromptLibraryItem {
	return {
		id: row.id,
		userId: row.userId,
		name: row.name,
		modelId: row.modelId,
		prompt: row.prompt,
		params: row.paramsJson,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
