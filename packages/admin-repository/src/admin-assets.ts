import type {
  AdminAssetItem,
  AdminAssetListOptions,
  ListAdminAssetsResult,
} from './types'

/**
 * 管理后台查看指定用户资产所需的最小只读契约。
 *
 * 实现由进程组合根注入，避免 admin 路由直接拿用户资产 repository 执行跨用户读取。
 * 这样管理员语义仍由 admin 边界命名和约束，底层实现可以在后续独立成 admin 投影。
 */
export interface AdminAssetRepository {
  listUserAssets(userId: string, options?: AdminAssetListOptions): Promise<ListAdminAssetsResult>
  getUserAsset(input: {
    userId: string
    assetId: string
    includeDeleted?: boolean
  }): Promise<AdminAssetItem | undefined>
}
