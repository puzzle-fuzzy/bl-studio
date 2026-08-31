export { AdminRepositoryError, type AdminRepositoryErrorCode } from './errors'
export { createAdminAssetRepository, type AdminAssetRepository } from './admin-assets'
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
import { createAdminAssetRepository, type AdminAssetRepository } from './admin-assets'
import { createAdminGalleryRepository, type AdminGalleryRepository } from './admin-gallery'
import { createAdminTaskRepository, type AdminTaskRepository } from './admin-tasks'
import { createAnalyticsRepository, type AnalyticsRepository } from './analytics'

export interface AdminRepository {
  readonly assets: AdminAssetRepository
  readonly gallery: AdminGalleryRepository
  readonly tasks: AdminTaskRepository
  readonly analytics: AnalyticsRepository
}

import type { BailianStudioDb } from '@bailian-studio/db'

export function createAdminRepository(db: BailianStudioDb): AdminRepository {
  return {
    assets: createAdminAssetRepository(db),
    gallery: createAdminGalleryRepository(db),
    tasks: createAdminTaskRepository(db),
    analytics: createAnalyticsRepository(db),
  }
}
