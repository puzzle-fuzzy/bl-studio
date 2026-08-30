/**
 * 管理任务中心持久化接缝：面向运营排障的 task_records 查询。
 *
 * 任务生命周期写入仍由 task-repository/业务 repository 负责；这里是只读的
 * admin 投影，允许保留已删除用户/记录的上下文缺失，方便定位孤儿任务。
 */
import {
	type BailianStudioDb,
	assetDerivatives,
	generationInputAssets,
	generationRecords,
	taskRecords,
	userAssets,
	users,
} from "@bailian-studio/db";
import { CanvasExecutionTaskInputSchema } from "@bailian-studio/canvas-contracts";
import type { ModelCategory } from "@bailian-studio/model-core";
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { clampLimit, decodeCursor, encodeCursor } from "./cursor";
import { AdminRepositoryError } from "./errors";
import { toTaskRecord } from "./mappers";
import type {
	AdminCanvasTaskAsset,
	AdminCanvasTaskContext,
	AdminCanvasTaskNode,
	AdminTaskItem,
	AdminTaskRequestContext,
	GenerationInputAsset,
	ListAdminTasksResult,
} from "./types";

export interface AdminTaskRepository {
	getAdminTaskRequestContext(
		taskId: string,
	): Promise<AdminTaskRequestContext | undefined>;
	listAdminTasks(input: {
		cursor?: string;
		limit?: number;
		status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
		type?: string;
		domain?: string;
		userId?: string;
		recordId?: string;
	}): Promise<ListAdminTasksResult>;
}

export function createAdminTaskRepository(
	db: BailianStudioDb,
): AdminTaskRepository {
	async function getAdminTaskRequestContext(
		taskId: string,
	): Promise<AdminTaskRequestContext | undefined> {
		const [taskRow] = await db
			.select()
			.from(taskRecords)
			.where(eq(taskRecords.id, taskId))
			.limit(1);
		if (taskRow === undefined) return undefined;

		const task = toTaskRecord(taskRow);
		if (task.type === "canvas.execute" && task.domain === "canvas") {
			const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input);
			if (parsed.success) {
				const outputAssetIds = [
					...new Set(
						Object.values(parsed.data.nodeRuns).flatMap(
							(run) => run.assetIds ?? [],
						),
					),
				];
				const outputAssetRows =
					task.userId === undefined || outputAssetIds.length === 0
						? []
						: await db
								.select({ asset: userAssets, thumbnail: assetDerivatives })
								.from(userAssets)
								.leftJoin(
									assetDerivatives,
									and(
										eq(assetDerivatives.assetId, userAssets.id),
										eq(assetDerivatives.kind, "thumbnail"),
										isNull(assetDerivatives.deletedAt),
									),
								)
								.where(
									and(
										eq(userAssets.userId, task.userId),
										inArray(userAssets.id, outputAssetIds),
										eq(userAssets.status, "ready"),
									),
								)
				const assets = outputAssetRows.map(({ asset, thumbnail }) => {
					const thumbnailFields =
						thumbnail === null
							? {}
							: {
									thumbnailStatus:
										thumbnail.status as AdminCanvasTaskAsset["thumbnailStatus"],
									...(thumbnail.storageProvider === null
										? {}
										: { thumbnailStorageProvider: thumbnail.storageProvider }),
									...(thumbnail.storageKey === null
										? {}
										: { thumbnailStorageKey: thumbnail.storageKey }),
								};
					return {
						id: asset.id,
						kind: asset.kind as AdminCanvasTaskAsset["kind"],
						source: asset.source as AdminCanvasTaskAsset["source"],
						...(asset.storageProvider === null
							? {}
							: { storageProvider: asset.storageProvider }),
						...(asset.storageKey === null
							? {}
							: { storageKey: asset.storageKey }),
						...(asset.mimeType === null ? {} : { mimeType: asset.mimeType }),
						...(asset.byteSize === null ? {} : { byteSize: asset.byteSize }),
						...(asset.fileName === null ? {} : { fileName: asset.fileName }),
						...(asset.recordId === null ? {} : { recordId: asset.recordId }),
						...(asset.modelId === null ? {} : { modelId: asset.modelId }),
						...thumbnailFields,
						createdAt: asset.createdAt.toISOString(),
					};
				});
				const generationIds = Object.values(parsed.data.nodeRuns)
					.map((run) => run.generationId)
					.filter((id): id is string => id !== undefined);
				const generationRows =
					generationIds.length === 0
						? []
						: await db
								.select({
									id: generationRecords.id,
									status: generationRecords.status,
									traceId: generationRecords.traceId,
									costEstimate: generationRecords.costEstimate,
									costFinal: generationRecords.costFinal,
									deletedAt: generationRecords.deletedAt,
								})
								.from(generationRecords)
								.where(inArray(generationRecords.id, generationIds));
				const generationById = new Map(
					generationRows.map((row) => [row.id, row]),
				);
				const nodes: AdminCanvasTaskNode[] = parsed.data.plan.nodes.map(
					(node) => {
						const run = parsed.data.nodeRuns[node.nodeId];
						const generationId = run?.generationId;
						const generation =
							generationId === undefined
								? undefined
								: generationById.get(generationId);
						const accountedCents =
							run?.cacheHit === true ||
								task.traceId === undefined ||
								generation?.traceId !== task.traceId ||
								generation?.deletedAt !== null
									? 0
									: generation.costFinal ?? generation.costEstimate;
						const nodeContext: AdminCanvasTaskNode = {
							nodeId: node.nodeId,
							kind: node.kind,
							modelId: node.modelId,
							params: node.params,
							assetRefs: node.assetRefs,
							dependencyBindings: node.dependencyBindings,
							dependsOn: node.dependsOn,
							status: run?.status ?? "queued",
							accountedCents,
							...(generationId === undefined ? {} : { generationId }),
							...(run?.assetIds === undefined
								? {}
								: { assetIds: run.assetIds }),
							...(run?.cacheHit === undefined
								? {}
								: { cacheHit: run.cacheHit }),
							...(run?.startedAt === undefined
								? {}
								: { startedAt: run.startedAt }),
							...(run?.completedAt === undefined
								? {}
								: { completedAt: run.completedAt }),
							...(run?.durationMs === undefined
								? {}
								: { durationMs: run.durationMs }),
							...(run?.errorCode === undefined
								? {}
								: { errorCode: run.errorCode }),
							...(run?.error === undefined ? {} : { error: run.error }),
							...(generation === undefined
								? {}
								: { generationStatus: generation.status }),
						};
						return nodeContext;
					},
				);
				const canvas: AdminCanvasTaskContext = {
					documentId: parsed.data.documentId,
					documentRevision: parsed.data.documentRevision,
					assets,
					nodes,
					...(parsed.data.cachePolicy === undefined
						? {}
						: { cachePolicy: parsed.data.cachePolicy }),
					...(parsed.data.rerun === undefined
						? {}
						: { rerun: parsed.data.rerun }),
				};
				return { task, canvas };
			}
		}
		if (task.recordId === undefined) return { task };

		const [record] = await db
			.select({
				id: generationRecords.id,
				modelId: generationRecords.modelId,
				category: generationRecords.category,
				inputParams: generationRecords.inputParamsJson,
			})
			.from(generationRecords)
			.where(eq(generationRecords.id, task.recordId))
			.limit(1);
		if (record === undefined) return { task };

		const inputAssetRows = await db
			.select({
				generationId: generationInputAssets.generationId,
				parameterName: generationInputAssets.parameterName,
				position: generationInputAssets.position,
				assetId: generationInputAssets.assetId,
				generationUserId: generationRecords.userId,
				assetUserId: userAssets.userId,
				kind: userAssets.kind,
				source: userAssets.source,
				storageProvider: userAssets.storageProvider,
				storageKey: userAssets.storageKey,
				originalUrl: userAssets.originalUrl,
			})
			.from(generationInputAssets)
			.innerJoin(
				generationRecords,
				eq(generationRecords.id, generationInputAssets.generationId),
			)
			.innerJoin(userAssets, eq(userAssets.id, generationInputAssets.assetId))
			.where(eq(generationInputAssets.generationId, record.id))
			.orderBy(
				generationInputAssets.parameterName,
				generationInputAssets.position,
			);

		const inputAssets = inputAssetRows.map((row) => {
			if (row.generationUserId !== row.assetUserId) {
				throw new AdminRepositoryError(
					"ADMIN_DATABASE_ERROR",
					`Generation input asset owner mismatch: ${row.generationId}/${row.assetId}`,
				);
			}
			return {
				generationId: row.generationId,
				parameterName: row.parameterName,
				position: row.position,
				assetId: row.assetId,
				userId: row.generationUserId,
				kind: row.kind as GenerationInputAsset["kind"],
				source: row.source as GenerationInputAsset["source"],
				...(row.storageProvider !== null
					? {
							storageProvider:
								row.storageProvider as GenerationInputAsset["storageProvider"],
						}
					: {}),
				...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
				...(row.originalUrl !== null ? { originalUrl: row.originalUrl } : {}),
			};
		});

		return {
			task,
			record: {
				id: record.id,
				modelId: record.modelId,
				category: record.category as ModelCategory,
				inputParams: record.inputParams,
				inputAssets,
			},
		};
	}

	async function listAdminTasks(input: {
		cursor?: string;
		limit?: number;
		status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
		type?: string;
		domain?: string;
		userId?: string;
		recordId?: string;
	}): Promise<ListAdminTasksResult> {
		const limit = clampLimit(input.limit);
		const cursor =
			input.cursor !== undefined ? decodeCursor(input.cursor) : undefined;
		const conditions: SQL[] = [isNull(taskRecords.deletedAt)];
		if (input.status !== undefined) {
			conditions.push(eq(taskRecords.status, input.status));
		}
		if (input.type !== undefined)
			conditions.push(eq(taskRecords.type, input.type));
		if (input.domain !== undefined) {
			conditions.push(eq(taskRecords.domain, input.domain));
		}
		if (input.userId !== undefined) {
			conditions.push(eq(taskRecords.userId, input.userId));
		}
		if (input.recordId !== undefined) {
			conditions.push(eq(taskRecords.recordId, input.recordId));
		}
		if (cursor !== undefined) {
			conditions.push(
				sql`(${taskRecords.createdAt} < ${cursor.createdAt} OR (${taskRecords.createdAt} = ${cursor.createdAt} AND ${taskRecords.id} < ${cursor.id}))`,
			);
		}

		const rows = await db
			.select({
				task: taskRecords,
				authorId: users.id,
				authorDisplayName: users.displayName,
				recordModelId: generationRecords.modelId,
				recordCategory: generationRecords.category,
			})
			.from(taskRecords)
			.leftJoin(users, eq(users.id, taskRecords.userId))
			.leftJoin(
				generationRecords,
				eq(generationRecords.id, taskRecords.recordId),
			)
			.where(and(...conditions))
			.orderBy(desc(taskRecords.createdAt), desc(taskRecords.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		const items: AdminTaskItem[] = page.map((row) => {
			const task = toTaskRecord(row.task);
			const error =
				task.errorJson === undefined
					? undefined
					: {
							category: task.errorJson.category,
							message: task.errorJson.message,
							retriable: task.errorJson.retriable,
							...(task.errorJson.code !== undefined
								? { code: task.errorJson.code }
								: {}),
						};
			const durationMs =
				task.startedAt !== undefined && task.completedAt !== undefined
					? Math.max(
							0,
							Date.parse(task.completedAt) - Date.parse(task.startedAt),
						)
					: undefined;
			return {
				id: task.id,
				type: task.type,
				domain: task.domain,
				status: task.status,
				priority: task.priority,
				attempts: task.attempts,
				maxAttempts: task.maxAttempts,
				nextRunAt: task.nextRunAt,
				...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
				...(task.completedAt !== undefined
					? { completedAt: task.completedAt }
					: {}),
				createdAt: task.createdAt,
				updatedAt: task.updatedAt,
				...(task.recordId !== undefined ? { recordId: task.recordId } : {}),
				...(task.userId !== undefined ? { userId: task.userId } : {}),
				...(task.traceId !== undefined ? { traceId: task.traceId } : {}),
				...(row.authorId !== null
					? {
							author: {
								id: row.authorId,
								displayName: row.authorDisplayName,
							},
						}
					: {}),
				...(row.recordModelId !== null && row.recordCategory !== null
					? {
							recordContext: {
								modelId: row.recordModelId,
								category: row.recordCategory as ModelCategory,
							},
						}
					: {}),
				...(error !== undefined ? { error } : {}),
				...(durationMs !== undefined ? { durationMs } : {}),
			};
		});

		return {
			items,
			...(hasMore && last !== undefined
				? {
						nextCursor: encodeCursor({
							createdAt: last.task.createdAt.toISOString(),
							id: last.task.id,
						}),
					}
				: {}),
		};
	}

	return { getAdminTaskRequestContext, listAdminTasks };
}
