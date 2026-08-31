export { AdminRepositoryError, type AdminRepositoryErrorCode } from './errors'
export { type AdminAssetRepository } from './admin-assets'
export { createAdminGalleryRepository, type AdminGalleryRepository } from './admin-gallery'
export { createAdminTaskRepository, type AdminTaskRepository } from './admin-tasks'
export { createAnalyticsRepository, type AnalyticsRepository } from './analytics'
export type {
  AdminGalleryItem,
  AdminAssetItem,
  AdminAssetListOptions,
  AdminCanvasTaskAsset,
  AdminCanvasTaskContext,
  AdminCanvasTaskNode,
  AdminTaskItem,
  AdminTaskRequestContext,
  AdminTaskRequestContextRecord,
  ArtifactKind,
  ArtifactStatus,
  ArtifactStorageProvider,
  CostMarginRow,
  CanvasCostAnalytics,
  CanvasOperationsAnalytics,
  GenerationArtifact,
  GenerationCallStats,
  GenerationInputAsset,
  GalleryVisibility,
  ListAdminGalleryResult,
  ListAdminAssetsResult,
  ListAdminTasksResult,
  ModelCost,
  RetentionAnalytics,
  TaskDiagnosticError,
} from './types'
import { createAdminGalleryRepository, type AdminGalleryRepository } from './admin-gallery'
import type { AdminAssetRepository } from './admin-assets'
import { createAdminTaskRepository, type AdminTaskRepository } from './admin-tasks'
import { createAnalyticsRepository, type AnalyticsRepository } from './analytics'

export interface AdminRepository {
  readonly assets: AdminAssetRepository
  readonly gallery: AdminGalleryRepository
  readonly tasks: AdminTaskRepository
  readonly analytics: AnalyticsRepository
}

import type { BailianStudioDb } from '@bailian-studio/db'

export function createAdminRepository(input: {
  db: BailianStudioDb
  assets: AdminAssetRepository
}): AdminRepository {
  return {
    assets: input.assets,
    gallery: createAdminGalleryRepository(input.db),
    tasks: createAdminTaskRepository(input.db),
    analytics: createAnalyticsRepository(input.db),
  }
}
