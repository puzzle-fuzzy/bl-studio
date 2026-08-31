/**
 * 资产路由：文件上传、URL 导入、统一资产列表。
 *
 * 路由只做 HTTP 适配（取参数、鉴权、调 service、回响应）；MIME/大小校验、kind
 * 推断、存储写入、user_assets 落库都下沉到 ./service。输入校验失败由 service 抛
 * ValidationError，经全局 onError 统一映射为 400。
 */

import type { UnifiedAssetItem } from "@bailian-studio/generation-repository";
import { ValidationError, validateInput } from "@bailian-studio/shared";
import {
	assetDownloadFileName,
	type StorageAdapter,
} from "@bailian-studio/storage";
import { Elysia } from "elysia";
import type { ApiDependencies } from "../../dependencies";
import { auditErrorCode, recordApiAuditEvent } from "../../lib/audit";
import { requestErrorResponseBody } from "../../lib/http-errors";
import { requireAuthUser } from "../auth/session";
import {
	ALLOWED_MIME_TYPES,
	assetDownloadStorageKey,
	assetWithReadUrl,
	ImportAssetSchema,
	importAsset,
	ListAssetsQuerySchema,
	uploadAsset,
} from "./service";

export function createAssetRoutes(deps: ApiDependencies) {
	return new Elysia({ prefix: "/api/assets" })
		.post("/upload", async ({ request }) => {
			const user = await requireAuthUser(request, deps.authService);
			try {
				const formData = await request.formData();
				const file = formData.get("file");
				const kindParam = formData.get("kind");

				if (!(file instanceof File)) {
					throw new ValidationError("File is required", "file");
				}

				const asset = await uploadAsset({
					file,
					userId: user.id,
					kindParam,
					storage: deps.storage,
					repository: deps.assetRepository,
					config: deps.assetConfig,
				});
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "asset.upload",
					outcome: "succeeded",
					targetType: "asset",
					targetId: asset.id,
					metadata: { kind: asset.kind, byteSize: asset.byteSize },
				});
				return { success: true, data: { asset } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "asset.upload",
					outcome: "failed",
					targetType: "asset",
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.post("/import", async ({ request, body }) => {
			const user = await requireAuthUser(request, deps.authService);
			try {
				const input = validateInput(ImportAssetSchema, body);
				const asset = await importAsset({
					input,
					userId: user.id,
					repository: deps.assetRepository,
				});
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "asset.import",
					outcome: "succeeded",
					targetType: "asset",
					targetId: asset.id,
					metadata: { kind: asset.kind },
				});
				return { success: true, data: { asset } };
			} catch (error) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "asset.import",
					outcome: "failed",
					targetType: "asset",
					metadata: { errorCode: auditErrorCode(error) },
				});
				throw error;
			}
		})
		.get("/capabilities", async ({ request }) => {
			await requireAuthUser(request, deps.authService);
			return {
				success: true,
				data: {
					maxAssetSizeBytes: deps.assetConfig.maxAssetSizeBytes,
					...(deps.assetConfig.maxMediaDurationSeconds !== undefined
						? {
								maxMediaDurationSeconds:
									deps.assetConfig.maxMediaDurationSeconds,
							}
						: {}),
					allowedMimeTypes: [...ALLOWED_MIME_TYPES].sort(),
					allowedKinds: ["image", "video", "audio", "text", "archive"] as const,
				},
			};
		})
		.get("/", async ({ request, query }) => {
			const user = await requireAuthUser(request, deps.authService);
			const { ids, limit, cursor, kind, source, q, sort } = validateInput(
				ListAssetsQuerySchema,
				query,
			);
			const normalizedQuery = q?.toLocaleLowerCase();
			const modelIds =
				normalizedQuery === undefined || normalizedQuery.length === 0
					? []
					: deps.modelCatalog.list()
							.filter((model) => model.availability.enabled)
							.filter((model) =>
								model.displayName.toLocaleLowerCase().includes(normalizedQuery),
							)
							.map((model) => model.id);
			const data = await deps.assetRepository.listUnifiedAssets(user.id, {
				sort,
				...(ids !== undefined ? { ids } : {}),
				...(limit !== undefined ? { limit } : {}),
				...(cursor !== undefined ? { cursor } : {}),
				...(kind !== undefined ? { kind } : {}),
				...(source !== undefined ? { source } : {}),
				...(q !== undefined && q.length > 0 ? { q, modelIds } : {}),
			});
			const items = await Promise.all(
				data.items.map((item) => assetWithReadUrl(item, deps.storage)),
			);
			return { success: true, data: { ...data, items } };
		})
		.get("/:id", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const asset = await deps.assetRepository.getUserAsset({
				userId: user.id,
				assetId: params.id,
			});
			if (asset === undefined) {
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"ASSET_NOT_FOUND",
					"Asset not found",
					set,
				);
			}
			return {
				success: true,
				data: { asset: await assetWithDownloadUrl(asset, deps.storage) },
			};
		})
		.delete("/:id", async ({ request, params, set }) => {
			const user = await requireAuthUser(request, deps.authService);
			const deleted = await deps.assetRepository.softDeleteUserAsset({
				userId: user.id,
				assetId: params.id,
			});
			if (!deleted) {
				await recordApiAuditEvent(deps.auditRepository, request, {
					userId: user.id,
					action: "asset.delete",
					outcome: "failed",
					targetType: "asset",
					targetId: params.id,
					metadata: { errorCode: "ASSET_NOT_FOUND" },
				});
				set.status = 404;
				return requestErrorResponseBody(
					request,
					"ASSET_NOT_FOUND",
					"Asset not found",
					set,
				);
			}
			await recordApiAuditEvent(deps.auditRepository, request, {
				userId: user.id,
				action: "asset.delete",
				outcome: "succeeded",
				targetType: "asset",
				targetId: params.id,
			});
			return new Response(null, { status: 204 });
		});
}

async function assetWithDownloadUrl(
	item: UnifiedAssetItem,
	storage: StorageAdapter,
) {
	const publicItem = await assetWithReadUrl(item, storage);
	const storageKey = assetDownloadStorageKey(item, storage);
	if (storageKey === undefined) return publicItem;

	return {
		...publicItem,
		downloadUrl: await storage.createReadUrl({
			key: storageKey,
			expiresInSeconds: 3600,
			downloadFileName: assetDownloadFileName(
				item.fileName,
				item.id,
				item.mimeType,
			),
		}),
	};
}
