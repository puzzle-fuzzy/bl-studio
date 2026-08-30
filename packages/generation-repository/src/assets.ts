/**
 * 用户资产持久化实现。
 *
 * 资产列表同时投影 user_assets、generation_artifacts 和 thumbnail derivative，
 * 因此它是一个独立的读写边界，API 代码直接依赖 AssetRepository。
 */
import {
	assetDerivatives,
	generationArtifacts,
	generationRecords,
	type BailianStudioDb,
	type BailianStudioDbTransaction,
	userAssets,
} from "@bailian-studio/db";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import type { TaskRecord } from "@bailian-studio/task-engine";
import type { TaskQueueTransactionStore } from "@bailian-studio/task-repository";
import {
	assetCursorFilters,
	decodeAssetCursor,
	encodeAssetCursor,
} from "./asset-cursor";
import { clampLimit } from "./cursor";
import type { AssetRepository } from "./asset-port";
import type {
	CreateUserAssetInput,
	ListUnifiedAssetsOptions,
	UnifiedAssetItem,
} from "./asset-types";
import { nextAssetDerivativeId, nextTaskRecordId } from "./id";

function safeParseJsonRecord(value: unknown): Record<string, unknown> | null {
	if (value === null || value === undefined) return null;
	return typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readDurationSeconds(value: unknown): number | undefined {
	const metadata = safeParseJsonRecord(value);
	const duration = metadata?.["durationSeconds"];
	return typeof duration === "number" &&
		Number.isFinite(duration) &&
		duration >= 0
		? duration
		: undefined;
}

function readRequestDurationSeconds(value: unknown): number | undefined {
	const request = safeParseJsonRecord(value);
	const duration = request?.["duration"];
	return typeof duration === "number" &&
		Number.isFinite(duration) &&
		duration >= 0
		? duration
		: undefined;
}

function readDeclaredResolution(
	storedValue: unknown,
	requestValue: unknown,
): string | undefined {
	const stored = safeParseJsonRecord(storedValue);
	const width = stored?.["width"];
	const height = stored?.["height"];
	if (
		typeof width === "number" &&
		Number.isFinite(width) &&
		width > 0 &&
		typeof height === "number" &&
		Number.isFinite(height) &&
		height > 0
	) {
		return `${width}×${height}`;
	}

	const storedResolution =
		normalizeDeclaredResolution(stored?.["resolution"]) ??
		normalizeDeclaredResolution(stored?.["size"]);
	if (storedResolution !== undefined) return storedResolution;

	const request = safeParseJsonRecord(requestValue);
	return (
		normalizeDeclaredResolution(request?.["size"]) ??
		normalizeDeclaredResolution(request?.["resolution"])
	);
}

function normalizeDeclaredResolution(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	if (normalized.length === 0) return undefined;
	const dimensions = /^(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)$/i.exec(
		normalized,
	);
	if (dimensions === null) return normalized;
	return `${dimensions[1]}×${dimensions[2]}`;
}

export function escapedLikePattern(value: string): string {
	return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export function toUnifiedAssetItem(
	row: typeof userAssets.$inferSelect,
	artifactText?: string | null,
	thumbnail?: typeof assetDerivatives.$inferSelect | null,
	generationInputParams?: Record<string, unknown> | null,
): UnifiedAssetItem {
	const durationSeconds =
		readDurationSeconds(row.metadataJson) ??
		readRequestDurationSeconds(generationInputParams);
	const declaredResolution = readDeclaredResolution(
		row.metadataJson,
		generationInputParams,
	);
	const url =
		row.storageUrl ??
		(row.storageKey === null ? (row.originalUrl ?? undefined) : undefined);

	return {
		id: row.id,
		kind: row.kind as UnifiedAssetItem["kind"],
		source: row.source as UnifiedAssetItem["source"],
		...(row.generationArtifactId !== null
			? { generationArtifactId: row.generationArtifactId }
			: {}),
		...(url !== undefined ? { url } : {}),
		...(artifactText !== undefined && artifactText !== null
			? { text: artifactText }
			: {}),
		...(row.mimeType !== null ? { mimeType: row.mimeType } : {}),
		...(row.byteSize !== null ? { byteSize: row.byteSize } : {}),
		...(durationSeconds !== undefined ? { durationSeconds } : {}),
		...(declaredResolution !== undefined ? { declaredResolution } : {}),
		...(row.fileName !== null ? { fileName: row.fileName } : {}),
		...(row.recordId !== null ? { recordId: row.recordId } : {}),
		...(row.modelId !== null ? { modelId: row.modelId } : {}),
		...(row.storageProvider !== null
			? { storageProvider: row.storageProvider }
			: {}),
		...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
		...(thumbnail !== undefined && thumbnail !== null
			? {
					thumbnailStatus:
						thumbnail.status as UnifiedAssetItem["thumbnailStatus"],
					...(thumbnail.storageProvider !== null
						? { thumbnailStorageProvider: thumbnail.storageProvider }
						: {}),
					...(thumbnail.storageKey !== null
						? { thumbnailStorageKey: thumbnail.storageKey }
						: {}),
				}
			: {}),
		createdAt: row.createdAt.toISOString(),
	};
}

function thumbnailSourceIsEligible(
	input: Pick<
		CreateUserAssetInput,
		| "kind"
		| "storageProvider"
		| "storageKey"
		| "originalUrl"
		| "enqueueThumbnail"
	>,
): boolean {
	if (
		input.enqueueThumbnail !== true ||
		(input.kind !== "image" && input.kind !== "video")
	)
		return false;
	if (input.storageProvider === "local" && input.storageKey !== undefined)
		return true;
	if (input.originalUrl === undefined) return false;
	try {
		return new URL(input.originalUrl).protocol === "https:";
	} catch {
		return false;
	}
}

/** 在资产写入事务内创建缩略图 derivative 和对应的媒体任务。 */
export async function enqueueAssetThumbnail(
	tx: BailianStudioDbTransaction,
	input: CreateUserAssetInput,
	now: string,
	taskQueueTransactionStore: TaskQueueTransactionStore,
): Promise<void> {
	if (!thumbnailSourceIsEligible(input)) return;

	const derivativeId = nextAssetDerivativeId();
	const [created] = await tx
		.insert(assetDerivatives)
		.values({
			id: derivativeId,
			assetId: input.id,
			userId: input.userId,
			kind: "thumbnail",
			status: "queued",
			createdBy: input.userId,
			updatedBy: input.userId,
			createdAt: new Date(now),
			updatedAt: new Date(now),
		})
		.onConflictDoNothing({
			target: [assetDerivatives.assetId, assetDerivatives.kind],
			where: sql`${assetDerivatives.deletedAt} is null`,
		})
		.returning({ id: assetDerivatives.id });

	if (created === undefined) return;

	const task: TaskRecord = {
		id: nextTaskRecordId(),
		type: "media.thumbnail",
		domain: "media",
		status: "queued",
		priority: -5,
		input: { assetId: input.id, derivativeId: created.id },
		attempts: 0,
		maxAttempts: 3,
		nextRunAt: now,
		recordId: created.id,
		userId: input.userId,
		...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
		createdAt: now,
		updatedAt: now,
	};
	await taskQueueTransactionStore.enqueueTask(tx, task);
}

export interface CreateAssetRepositoryOptions {
	db: BailianStudioDb;
	taskQueueTransactionStore: TaskQueueTransactionStore;
}

export function createAssetRepository({ db, taskQueueTransactionStore }: CreateAssetRepositoryOptions): AssetRepository {
	async function createUserAsset(input: CreateUserAssetInput): Promise<void> {
		const now = input.now ?? new Date().toISOString();
		await db.transaction(async (tx) => {
			await tx.insert(userAssets).values({
				id: input.id,
				userId: input.userId,
				kind: input.kind,
				source: input.source,
				generationArtifactId: input.generationArtifactId ?? null,
				recordId: input.recordId ?? null,
				modelId: input.modelId ?? null,
				fileName: input.fileName ?? null,
				originalUrl: input.originalUrl ?? null,
				mimeType: input.mimeType ?? null,
				byteSize: input.byteSize ?? null,
				storageProvider: input.storageProvider ?? null,
				storageKey: input.storageKey ?? null,
				storageUrl: input.storageUrl ?? null,
				metadataJson: input.metadata ?? null,
				status: "ready",
				createdBy: input.userId,
				updatedBy: input.userId,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			});
			await enqueueAssetThumbnail(tx, input, now, taskQueueTransactionStore);
		});
	}

	async function listUnifiedAssets(
		userId: string,
		options: ListUnifiedAssetsOptions = {},
	) {
		const limit = clampLimit(options.limit ?? 20);
		const sort = options.sort ?? "time";
		const filters = assetCursorFilters(options);
		const cursor =
			options.cursor !== undefined
				? decodeAssetCursor(options.cursor, { sort, filters })
				: undefined;
		const fetchLimit = limit + 1;
		const query = options.q?.trim();
		const matchingModelIds =
			options.modelIds?.filter((id) => id.length > 0) ?? [];
		const titleSortValue = sql<string>`lower(coalesce(${userAssets.fileName}, ${userAssets.modelId}, ${userAssets.id}))`;
		const searchCondition = query
			? or(
					ilike(userAssets.id, escapedLikePattern(query)),
					ilike(userAssets.fileName, escapedLikePattern(query)),
					ilike(userAssets.modelId, escapedLikePattern(query)),
					matchingModelIds.length > 0
						? inArray(userAssets.modelId, matchingModelIds)
						: undefined,
				)
			: undefined;
		const cursorCondition =
			cursor === undefined
				? undefined
				: sort === "time" && typeof cursor.value === "string"
					? or(
							lt(userAssets.createdAt, new Date(cursor.value)),
							and(
								eq(userAssets.createdAt, new Date(cursor.value)),
								lt(userAssets.id, cursor.id),
							),
						)
					: sort === "title" && typeof cursor.value === "string"
						? or(
								gt(titleSortValue, cursor.value),
								and(
									eq(titleSortValue, cursor.value),
									gt(userAssets.id, cursor.id),
								),
							)
						: sort === "size" && cursor.value === null
							? and(isNull(userAssets.byteSize), lt(userAssets.id, cursor.id))
							: sort === "size" && typeof cursor.value === "number"
								? or(
										lt(userAssets.byteSize, cursor.value),
										isNull(userAssets.byteSize),
										and(
											eq(userAssets.byteSize, cursor.value),
											lt(userAssets.id, cursor.id),
										),
									)
								: undefined;
		const orderBy =
			sort === "time"
				? [desc(userAssets.createdAt), desc(userAssets.id)]
				: sort === "title"
					? [asc(titleSortValue), asc(userAssets.id)]
					: [sql`${userAssets.byteSize} desc nulls last`, desc(userAssets.id)];

		const rows = await db
			.select({
				asset: userAssets,
				artifactText: generationArtifacts.text,
				thumbnail: assetDerivatives,
				generationInputParams: generationRecords.inputParamsJson,
				titleSortValue,
			})
			.from(userAssets)
			.leftJoin(
				generationArtifacts,
				eq(userAssets.generationArtifactId, generationArtifacts.id),
			)
			.leftJoin(
				assetDerivatives,
				and(
					eq(assetDerivatives.assetId, userAssets.id),
					eq(assetDerivatives.kind, "thumbnail"),
					isNull(assetDerivatives.deletedAt),
				),
			)
			.leftJoin(
				generationRecords,
				and(
					eq(userAssets.recordId, generationRecords.id),
					eq(userAssets.userId, generationRecords.userId),
				),
			)
			.where(
				and(
					eq(userAssets.userId, userId),
					eq(userAssets.status, "ready"),
					isNull(userAssets.deletedAt),
					options.kind !== undefined
						? eq(userAssets.kind, options.kind)
						: undefined,
					options.source !== undefined
						? eq(userAssets.source, options.source)
						: undefined,
					searchCondition,
					cursorCondition,
				),
			)
			.orderBy(...orderBy)
			.limit(fetchLimit);

		const pageRows = rows.slice(0, limit);
		const items = pageRows.map((row) =>
			toUnifiedAssetItem(
				row.asset,
				row.artifactText,
				row.thumbnail,
				row.generationInputParams,
			),
		);
		const lastRow = pageRows[pageRows.length - 1];
		const nextCursor =
			lastRow !== undefined && rows.length > limit
				? encodeAssetCursor({
						sort,
						value:
							sort === "time"
								? lastRow.asset.createdAt.toISOString()
								: sort === "title"
									? lastRow.titleSortValue
									: lastRow.asset.byteSize,
						id: lastRow.asset.id,
						filters,
					})
				: undefined;

		return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) };
	}

	async function getUserAsset(input: {
		userId: string;
		assetId: string;
		includeDeleted?: boolean;
	}): Promise<UnifiedAssetItem | undefined> {
		const [row] = await db
			.select({
				asset: userAssets,
				artifactText: generationArtifacts.text,
				thumbnail: assetDerivatives,
				generationInputParams: generationRecords.inputParamsJson,
			})
			.from(userAssets)
			.leftJoin(
				generationArtifacts,
				eq(userAssets.generationArtifactId, generationArtifacts.id),
			)
			.leftJoin(
				assetDerivatives,
				and(
					eq(assetDerivatives.assetId, userAssets.id),
					eq(assetDerivatives.kind, "thumbnail"),
					isNull(assetDerivatives.deletedAt),
				),
			)
			.leftJoin(
				generationRecords,
				and(
					eq(userAssets.recordId, generationRecords.id),
					eq(userAssets.userId, generationRecords.userId),
				),
			)
			.where(
				and(
					eq(userAssets.id, input.assetId),
					eq(userAssets.userId, input.userId),
					eq(userAssets.status, "ready"),
					input.includeDeleted === true
						? undefined
						: isNull(userAssets.deletedAt),
				),
			)
			.limit(1);

		return row === undefined
			? undefined
			: toUnifiedAssetItem(
					row.asset,
					row.artifactText,
					row.thumbnail,
					row.generationInputParams,
				);
	}

	async function softDeleteUserAsset(input: {
		userId: string;
		assetId: string;
		now?: string;
	}): Promise<boolean> {
		const now = input.now ?? new Date().toISOString();
		return db.transaction(async (tx) => {
			const rows = await tx
				.update(userAssets)
				.set({
					deletedAt: new Date(now),
					deletedBy: input.userId,
					updatedAt: new Date(now),
					updatedBy: input.userId,
				})
				.where(
					and(
						eq(userAssets.id, input.assetId),
						eq(userAssets.userId, input.userId),
						isNull(userAssets.deletedAt),
					),
				)
				.returning({ id: userAssets.id });

			if (rows.length === 0) return false;
			const derivatives = await tx
				.update(assetDerivatives)
				.set({
					deletedAt: new Date(now),
					deletedBy: input.userId,
					updatedAt: new Date(now),
					updatedBy: input.userId,
				})
				.where(
					and(
						eq(assetDerivatives.assetId, input.assetId),
						eq(assetDerivatives.userId, input.userId),
						isNull(assetDerivatives.deletedAt),
					),
				)
				.returning({ id: assetDerivatives.id });

			const derivativeIds = derivatives.map((derivative) => derivative.id);
			if (derivativeIds.length > 0) {
				await taskQueueTransactionStore.cancelQueuedTasks(tx, {
					recordIds: derivativeIds,
					type: "media.thumbnail",
					error: {
						category: "cancelled",
						message:
							"Thumbnail task cancelled because the source asset was deleted",
						retriable: false,
						code: "THUMBNAIL_SOURCE_DELETED",
					},
					now,
					updatedBy: input.userId,
				});
			}
			return true;
		});
	}

	return {
		createUserAsset,
		listUnifiedAssets,
		getUserAsset,
		softDeleteUserAsset,
	};
}
