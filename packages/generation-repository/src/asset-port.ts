/**
 * 用户资产的 API 持久化 port。
 *
 * 这里集中声明 API 需要的最小能力；SQL 实现归档在 assets.ts，generation-
 * repository 只在旧调用方仍需要时通过兼容 facade 重新暴露旧方法。
 */
import type {
	CreateUserAssetInput,
	ListUnifiedAssetsOptions,
	ListUnifiedAssetsResult,
	UnifiedAssetItem,
} from "./asset-types";

export interface AssetRepository {
	createUserAsset(input: CreateUserAssetInput): Promise<void>;
	listUnifiedAssets(
		userId: string,
		options?: ListUnifiedAssetsOptions,
	): Promise<ListUnifiedAssetsResult>;
	getUserAsset(input: {
		userId: string;
		assetId: string;
		includeDeleted?: boolean;
	}): Promise<UnifiedAssetItem | undefined>;
	softDeleteUserAsset(input: {
		userId: string;
		assetId: string;
		now?: string;
	}): Promise<boolean>;
}
