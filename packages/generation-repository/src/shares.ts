/**
 * 生成分享持久化实现。
 *
 * owner 写入与匿名公开读取在 port 上分开，但共享同一个数据库句柄；公开读取
 * 在 repository 内完成脱敏，API 层只负责补充 storage read URL。
 */
import { asc, and, desc, eq, gt, isNull, or } from "drizzle-orm";
import {
	generationArtifacts,
	generationRecords,
	generationShares,
	type BailianStudioDb,
} from "@bailian-studio/db";
import type { PublicShareRepository, ShareRepository } from "./share-port";
import { GenerationRepositoryError } from "./errors";
import {
	toGenerationArtifact,
	toGenerationRecord,
	toGenerationShare,
} from "./mappers";
import { nextGenerationShareId } from "./id";
import type {
	CreateGenerationShareInput,
	GenerationArtifact,
	GenerationRecord,
	GenerationShare,
	GetGenerationShareForRecordInput,
	PublicSharedGeneration,
	PublicSharedGenerationArtifact,
	PublicSharedGenerationRecord,
	RevokeGenerationShareInput,
} from "./types";

function parseDate(value: string | undefined): Date | null {
	return value === undefined ? null : new Date(value);
}

function activeShareCondition(shareId: string, now: Date) {
	return and(
		eq(generationShares.id, shareId),
		isNull(generationShares.deletedAt),
		isNull(generationShares.revokedAt),
		or(isNull(generationShares.expiresAt), gt(generationShares.expiresAt, now)),
		isNull(generationRecords.deletedAt),
	);
}

function toPublicSharedRecord(
	record: GenerationRecord,
	includeParams: boolean,
): PublicSharedGenerationRecord {
	return {
		id: record.id,
		modelId: record.modelId,
		provider: record.provider,
		providerModel: record.providerModel,
		category: record.category,
		...(includeParams ? { inputParams: record.inputParams } : {}),
		status: record.status,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

function toPublicSharedArtifact(
	artifact: GenerationArtifact,
): PublicSharedGenerationArtifact {
	return {
		id: artifact.id,
		kind: artifact.kind,
		...(artifact.mimeType !== undefined ? { mimeType: artifact.mimeType } : {}),
		...(artifact.byteSize !== undefined ? { byteSize: artifact.byteSize } : {}),
		status: artifact.status,
		createdAt: artifact.createdAt,
	};
}

export function createShareRepository(
	db: BailianStudioDb,
): ShareRepository & PublicShareRepository {
	async function createGenerationShare(
		input: CreateGenerationShareInput,
	): Promise<GenerationShare> {
		const now = input.now ?? new Date().toISOString();
		const [record] = await db
			.select({ id: generationRecords.id })
			.from(generationRecords)
			.where(
				and(
					eq(generationRecords.id, input.recordId),
					eq(generationRecords.userId, input.userId),
				),
			)
			.limit(1);

		if (record === undefined) {
			throw new GenerationRepositoryError(
				"GENERATION_NOT_FOUND",
				`Generation not found: ${input.recordId}`,
			);
		}

		const [inserted] = await db
			.insert(generationShares)
			.values({
				id: nextGenerationShareId(),
				recordId: input.recordId,
				userId: input.userId,
				includeParams: input.includeParams ?? false,
				expiresAt: parseDate(input.expiresAt),
				createdAt: new Date(now),
				updatedAt: new Date(now),
			})
			.onConflictDoNothing()
			.returning();

		if (inserted !== undefined) return toGenerationShare(inserted);

		const [existing] = await db
			.select()
			.from(generationShares)
			.where(eq(generationShares.recordId, input.recordId))
			.orderBy(desc(generationShares.createdAt))
			.limit(1);
		if (existing === undefined) {
			throw new GenerationRepositoryError(
				"DATABASE_ERROR",
				"Generation share could not be created",
			);
		}

		const existingExpired =
			existing.expiresAt !== null && existing.expiresAt <= new Date(now);
		const needsUpdate =
			existingExpired ||
			input.includeParams !== undefined ||
			input.expiresAt !== undefined;
		if (!needsUpdate) return toGenerationShare(existing);

		const [updated] = await db
			.update(generationShares)
			.set({
				includeParams: input.includeParams ?? existing.includeParams,
				expiresAt:
					input.expiresAt === undefined ? null : new Date(input.expiresAt),
				revokedAt: null,
				revokedBy: null,
				updatedAt: new Date(now),
				updatedBy: input.userId,
			})
			.where(
				and(
					eq(generationShares.id, existing.id),
					eq(generationShares.userId, input.userId),
					isNull(generationShares.revokedAt),
				),
			)
			.returning();

		return updated === undefined
			? toGenerationShare(existing)
			: toGenerationShare(updated);
	}

	async function getGenerationRecord(
		id: string,
	): Promise<GenerationRecord | undefined> {
		const [row] = await db
			.select()
			.from(generationRecords)
			.where(eq(generationRecords.id, id))
			.limit(1);
		return row === undefined ? undefined : toGenerationRecord(row);
	}

	async function getGenerationShareForRecord(
		input: GetGenerationShareForRecordInput,
	): Promise<GenerationShare | undefined> {
		const [share] = await db
			.select()
			.from(generationShares)
			.where(
				and(
					eq(generationShares.recordId, input.recordId),
					eq(generationShares.userId, input.userId),
					isNull(generationShares.deletedAt),
					isNull(generationShares.revokedAt),
					or(
						isNull(generationShares.expiresAt),
						gt(generationShares.expiresAt, new Date()),
					),
				),
			)
			.orderBy(desc(generationShares.createdAt))
			.limit(1);
		return share === undefined ? undefined : toGenerationShare(share);
	}

	async function revokeGenerationShare(
		input: RevokeGenerationShareInput,
	): Promise<GenerationShare | undefined> {
		const now = input.now ?? new Date().toISOString();
		const [revoked] = await db
			.update(generationShares)
			.set({
				revokedAt: new Date(now),
				revokedBy: input.userId,
				updatedAt: new Date(now),
				updatedBy: input.userId,
			})
			.where(
				and(
					eq(generationShares.recordId, input.recordId),
					eq(generationShares.userId, input.userId),
					isNull(generationShares.deletedAt),
					isNull(generationShares.revokedAt),
				),
			)
			.returning();
		return revoked === undefined ? undefined : toGenerationShare(revoked);
	}

	async function getPublicSharedGeneration(
		shareId: string,
	): Promise<PublicSharedGeneration | undefined> {
		const [row] = await db
			.select({ share: generationShares, record: generationRecords })
			.from(generationShares)
			.innerJoin(
				generationRecords,
				eq(generationShares.recordId, generationRecords.id),
			)
			.where(activeShareCondition(shareId, new Date()))
			.limit(1);
		if (row === undefined) return undefined;

		const artifacts = await db
			.select()
			.from(generationArtifacts)
			.where(eq(generationArtifacts.recordId, row.record.id))
			.orderBy(asc(generationArtifacts.createdAt));
		const record = toGenerationRecord(row.record);
		return {
			share: {
				id: row.share.id,
				recordId: row.share.recordId,
				...(row.share.expiresAt !== null
					? { expiresAt: row.share.expiresAt.toISOString() }
					: {}),
				createdAt: row.share.createdAt.toISOString(),
				updatedAt: row.share.updatedAt.toISOString(),
			},
			record: toPublicSharedRecord(record, row.share.includeParams),
			artifacts: artifacts.map((artifact) =>
				toPublicSharedArtifact(toGenerationArtifact(artifact)),
			),
		};
	}

	async function getPublicSharedArtifact(
		shareId: string,
		artifactId: string,
	): Promise<GenerationArtifact | undefined> {
		const [row] = await db
			.select({ artifact: generationArtifacts })
			.from(generationShares)
			.innerJoin(
				generationRecords,
				eq(generationShares.recordId, generationRecords.id),
			)
			.innerJoin(
				generationArtifacts,
				eq(generationArtifacts.recordId, generationRecords.id),
			)
			.where(
				and(
					activeShareCondition(shareId, new Date()),
					eq(generationArtifacts.id, artifactId),
					eq(generationArtifacts.status, "stored"),
					isNull(generationArtifacts.deletedAt),
				),
			)
			.limit(1);
		return row === undefined ? undefined : toGenerationArtifact(row.artifact);
	}

	return {
		createGenerationShare,
		getGenerationRecord,
		getGenerationShareForRecord,
		revokeGenerationShare,
		getPublicSharedGeneration,
		getPublicSharedArtifact,
	};
}
