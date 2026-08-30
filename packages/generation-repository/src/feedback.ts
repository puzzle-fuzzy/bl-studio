/**
 * 用户反馈持久化接缝：提交反馈、查询自己的反馈，以及 admin 状态流转。
 *
 * 反馈不依赖生成记录或画廊状态；单独的 port 让用户反馈模块可以独立演进，
 * API 直接依赖该窄 port，避免把反馈状态流转混入 generation 生命周期接口。
 */
import { randomUUID } from "node:crypto";
import { type BailianStudioDb, userFeedback } from "@bailian-studio/db";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { GenerationRepositoryError } from "./errors";
import type {
	FeedbackKind,
	FeedbackStatus,
	ListFeedbackResult,
	UserFeedback,
} from "./types";

export interface FeedbackRepository {
	submitFeedback(input: {
		userId: string;
		kind: FeedbackKind;
		content: string;
	}): Promise<UserFeedback>;
	listFeedback(input: {
		cursor?: string;
		limit?: number;
		status?: FeedbackStatus;
	}): Promise<ListFeedbackResult>;
	listMyFeedback(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListFeedbackResult>;
	updateFeedbackStatus(input: {
		itemId: string;
		status: FeedbackStatus;
		resolvedBy: string;
	}): Promise<UserFeedback>;
}

export function createFeedbackRepository(
	db: BailianStudioDb,
): FeedbackRepository {
	async function submitFeedback(input: {
		userId: string;
		kind: FeedbackKind;
		content: string;
	}): Promise<UserFeedback> {
		const now = new Date();
		const [row] = await db
			.insert(userFeedback)
			.values({
				id: randomUUID(),
				userId: input.userId,
				kind: input.kind,
				content: input.content,
				status: "open",
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"DATABASE_ERROR",
				"Failed to submit feedback",
			);
		}
		return toFeedback(row);
	}

	async function listFeedback(input: {
		cursor?: string;
		limit?: number;
		status?: FeedbackStatus;
	}): Promise<ListFeedbackResult> {
		return listFeedbackPage(db, input);
	}

	async function listMyFeedback(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListFeedbackResult> {
		return listFeedbackPage(db, input);
	}

	async function updateFeedbackStatus(input: {
		itemId: string;
		status: FeedbackStatus;
		resolvedBy: string;
	}): Promise<UserFeedback> {
		const now = new Date();
		const terminal = input.status === "resolved" || input.status === "closed";
		const [row] = await db
			.update(userFeedback)
			.set({
				status: input.status,
				...(terminal ? { resolvedBy: input.resolvedBy, resolvedAt: now } : {}),
				updatedAt: now,
				updatedBy: input.resolvedBy,
			})
			.where(
				and(eq(userFeedback.id, input.itemId), isNull(userFeedback.deletedAt)),
			)
			.returning();
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Feedback not found: ${input.itemId}`,
			);
		}
		return toFeedback(row);
	}

	return {
		submitFeedback,
		listFeedback,
		listMyFeedback,
		updateFeedbackStatus,
	};
}

async function listFeedbackPage(
	db: BailianStudioDb,
	input: {
		userId?: string;
		cursor?: string;
		limit?: number;
		status?: FeedbackStatus;
	},
): Promise<ListFeedbackResult> {
	const limit = clampLimit(input.limit);
	const cursor =
		input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
	const conditions: SQL[] = [isNull(userFeedback.deletedAt)];
	if (input.userId !== undefined) {
		conditions.push(eq(userFeedback.userId, input.userId));
	}
	if (input.status !== undefined) {
		conditions.push(eq(userFeedback.status, input.status));
	}
	if (cursor !== undefined) {
		conditions.push(
			sql`(${userFeedback.createdAt} < ${cursor.createdAt} OR (${userFeedback.createdAt} = ${cursor.createdAt} AND ${userFeedback.id} < ${cursor.id}))`,
		);
	}

	const rows = await db
		.select()
		.from(userFeedback)
		.where(and(...conditions))
		.orderBy(desc(userFeedback.createdAt), desc(userFeedback.id))
		.limit(limit + 1);
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const last = page[page.length - 1];
	return {
		items: page.map(toFeedback),
		...(hasMore && last !== undefined
			? {
					nextCursor: encodeCursor({
						createdAt: last.createdAt.toISOString(),
						id: last.id,
					}),
				}
			: {}),
	};
}

function toFeedback(row: typeof userFeedback.$inferSelect): UserFeedback {
	return {
		id: row.id,
		userId: row.userId,
		kind: row.kind as FeedbackKind,
		content: row.content,
		status: row.status as FeedbackStatus,
		...(row.resolvedBy !== null ? { resolvedBy: row.resolvedBy } : {}),
		...(row.resolvedAt !== null
			? { resolvedAt: row.resolvedAt.toISOString() }
			: {}),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
