/**
 * 内容举报持久化接缝：公开作品举报及 admin 处理状态。
 *
 * 目标作品的“是否仍可被举报”校验在这里与举报写入保持同一持久化边界；
 * 举报后的画廊下架联动属于 admin gallery port，由 API 编排层显式调用。
 */
import { randomUUID } from "node:crypto";
import {
	type BailianStudioDb,
	contentReports,
	generationRecords,
} from "@bailian-studio/db";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { GenerationRepositoryError } from "./errors";
import type {
	ContentReport,
	ContentReportReason,
	ContentReportStatus,
	ListContentReportsResult,
} from "./types";

export interface ContentReportRepository {
	submitContentReport(input: {
		reporterId: string;
		generationId: string;
		reason: ContentReportReason;
		details?: string;
	}): Promise<ContentReport>;
	listContentReports(input: {
		cursor?: string;
		limit?: number;
		status?: ContentReportStatus;
	}): Promise<ListContentReportsResult>;
	updateContentReport(input: {
		reportId: string;
		status: ContentReportStatus;
		resolvedBy: string;
		resolutionNote?: string;
	}): Promise<ContentReport>;
}

export function createContentReportRepository(
	db: BailianStudioDb,
): ContentReportRepository {
	async function submitContentReport(input: {
		reporterId: string;
		generationId: string;
		reason: ContentReportReason;
		details?: string;
	}): Promise<ContentReport> {
		const [target] = await db
			.select({ id: generationRecords.id })
			.from(generationRecords)
			.where(
				and(
					eq(generationRecords.id, input.generationId),
					eq(generationRecords.visibility, "public"),
					eq(generationRecords.status, "succeeded"),
					isNull(generationRecords.deletedAt),
					isNull(generationRecords.hiddenAt),
				),
			)
			.limit(1);
		if (target === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Generation not found: ${input.generationId}`,
			);
		}

		const now = new Date();
		try {
			const [row] = await db
				.insert(contentReports)
				.values({
					id: randomUUID(),
					generationId: input.generationId,
					reporterId: input.reporterId,
					reason: input.reason,
					...(input.details !== undefined ? { details: input.details } : {}),
					status: "open",
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (row === undefined) {
				throw new GenerationRepositoryError(
					"DATABASE_ERROR",
					"Failed to submit content report",
				);
			}
			return toContentReport(row);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new GenerationRepositoryError(
					"CONTENT_REPORT_DUPLICATE",
					"You have already reported this content",
				);
			}
			throw error;
		}
	}

	async function listContentReports(input: {
		cursor?: string;
		limit?: number;
		status?: ContentReportStatus;
	}): Promise<ListContentReportsResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const conditions: SQL[] = [isNull(contentReports.deletedAt)];
		if (input.status !== undefined) {
			conditions.push(eq(contentReports.status, input.status));
		}
		if (cursor !== undefined) {
			conditions.push(
				sql`(${contentReports.createdAt} < ${cursor.createdAt} OR (${contentReports.createdAt} = ${cursor.createdAt} AND ${contentReports.id} < ${cursor.id}))`,
			);
		}
		const rows = await db
			.select()
			.from(contentReports)
			.where(and(...conditions))
			.orderBy(desc(contentReports.createdAt), desc(contentReports.id))
			.limit(limit + 1);
		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		return {
			items: page.map(toContentReport),
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

	async function updateContentReport(input: {
		reportId: string;
		status: ContentReportStatus;
		resolvedBy: string;
		resolutionNote?: string;
	}): Promise<ContentReport> {
		const now = new Date();
		const terminal =
			input.status === "resolved" || input.status === "dismissed";
		const [row] = await db
			.update(contentReports)
			.set({
				status: input.status,
				resolutionNote: input.resolutionNote ?? null,
				...(terminal
					? { resolvedBy: input.resolvedBy, resolvedAt: now }
					: { resolvedBy: null, resolvedAt: null }),
				updatedAt: now,
				updatedBy: input.resolvedBy,
			})
			.where(
				and(
					eq(contentReports.id, input.reportId),
					isNull(contentReports.deletedAt),
				),
			)
			.returning();
		if (row === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Content report not found: ${input.reportId}`,
			);
		}
		return toContentReport(row);
	}

	return {
		submitContentReport,
		listContentReports,
		updateContentReport,
	};
}

function toContentReport(
	row: typeof contentReports.$inferSelect,
): ContentReport {
	return {
		id: row.id,
		generationId: row.generationId,
		reporterId: row.reporterId,
		reason: row.reason as ContentReportReason,
		...(row.details !== null ? { details: row.details } : {}),
		status: row.status as ContentReportStatus,
		...(row.resolvedBy !== null ? { resolvedBy: row.resolvedBy } : {}),
		...(row.resolutionNote !== null
			? { resolutionNote: row.resolutionNote }
			: {}),
		...(row.resolvedAt !== null
			? { resolvedAt: row.resolvedAt.toISOString() }
			: {}),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as { code?: unknown; cause?: unknown };
	if (candidate.code === "23505") return true;
	return isUniqueViolation(candidate.cause);
}
