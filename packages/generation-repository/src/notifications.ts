/**
 * 社交通知持久化接缝。
 *
 * 这里集中拥有通知收件箱、已读状态以及点赞/收藏通知所需的作者查询。
 * API 只依赖这个窄 port，避免通知收件箱扩大 generation 生命周期接口。
 */
import { randomUUID } from "node:crypto";
import {
	type BailianStudioDb,
	generationRecords,
	notifications,
} from "@bailian-studio/db";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import type {
	ListNotificationsResult,
	NotificationItem,
	NotificationKind,
} from "./types";

export interface NotificationRepository {
	/** 读取记录作者 id（不存在或已删除返回 undefined）。 */
	getGenerationOwner(recordId: string): Promise<string | undefined>;
	createSocialNotification(input: {
		recipientId: string;
		actorId?: string;
		kind: NotificationKind;
		recordId?: string;
		title: string;
		body: string;
	}): Promise<void>;
	listNotifications(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListNotificationsResult>;
	countUnreadNotifications(userId: string): Promise<number>;
	markNotificationRead(input: {
		userId: string;
		notificationId: string;
	}): Promise<boolean>;
	markAllNotificationsRead(userId: string): Promise<number>;
}

export function createNotificationRepository(
	db: BailianStudioDb,
): NotificationRepository {
	async function getGenerationOwner(
		recordId: string,
	): Promise<string | undefined> {
		const [row] = await db
			.select({ userId: generationRecords.userId })
			.from(generationRecords)
			.where(
				and(
					eq(generationRecords.id, recordId),
					isNull(generationRecords.deletedAt),
				),
			)
			.limit(1);
		return row?.userId;
	}

	/** 创建一条社交通知（best-effort：失败不影响点赞/收藏主流程，由调用方吞掉）。 */
	async function createSocialNotification(input: {
		recipientId: string;
		actorId?: string;
		kind: NotificationKind;
		recordId?: string;
		title: string;
		body: string;
	}): Promise<void> {
		const now = new Date();
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
		});
	}

	/** 分页列出某用户的通知（keyset：createdAt desc, id desc）。 */
	async function listNotifications(input: {
		userId: string;
		cursor?: string;
		limit?: number;
	}): Promise<ListNotificationsResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const conditions: SQL[] = [eq(notifications.userId, input.userId)];
		if (cursor !== undefined) {
			conditions.push(
				sql`(${notifications.createdAt} < ${cursor.createdAt} OR (${notifications.createdAt} = ${cursor.createdAt} AND ${notifications.id} < ${cursor.id}))`,
			);
		}

		const rows = await db
			.select()
			.from(notifications)
			.where(and(...conditions))
			.orderBy(desc(notifications.createdAt), desc(notifications.id))
			.limit(limit + 1);
		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];

		return {
			items: page.map(toNotificationItem),
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

	async function countUnreadNotifications(userId: string): Promise<number> {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(notifications)
			.where(
				and(eq(notifications.userId, userId), isNull(notifications.readAt)),
			);
		return row?.count ?? 0;
	}

	async function markNotificationRead(input: {
		userId: string;
		notificationId: string;
	}): Promise<boolean> {
		const [row] = await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notifications.id, input.notificationId),
					eq(notifications.userId, input.userId),
				),
			)
			.returning({ id: notifications.id });
		return row !== undefined;
	}

	async function markAllNotificationsRead(userId: string): Promise<number> {
		const rows = await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(eq(notifications.userId, userId), isNull(notifications.readAt)),
			)
			.returning({ id: notifications.id });
		return rows.length;
	}

	return {
		getGenerationOwner,
		createSocialNotification,
		listNotifications,
		countUnreadNotifications,
		markNotificationRead,
		markAllNotificationsRead,
	};
}

function toNotificationItem(
	row: typeof notifications.$inferSelect,
): NotificationItem {
	return {
		id: row.id,
		kind: row.kind as NotificationKind,
		...(row.actorId !== null ? { actorId: row.actorId } : {}),
		...(row.recordId !== null ? { recordId: row.recordId } : {}),
		title: row.title,
		body: row.body,
		read: row.readAt !== null,
		createdAt: row.createdAt.toISOString(),
	};
}
