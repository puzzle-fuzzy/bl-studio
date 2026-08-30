export { AdminRepositoryError, type AdminRepositoryErrorCode } from './errors'
export { createAdminGalleryRepository, type AdminGalleryRepository } from './admin-gallery'
export { createAdminTaskRepository, type AdminTaskRepository } from './admin-tasks'
export { createAnalyticsRepository, type AnalyticsRepository } from './analytics'
export {
  type AdminGalleryItem,
  type AdminTaskItem,
  type AdminTaskRequestContext,
  type AdminTaskRequestContextRecord,
  type ArtifactKind,
  type ArtifactStatus,
  type ArtifactStorageProvider,
  type CostMarginRow,
  type GenerationArtifact,
  type GenerationCallStats,
  type GenerationInputAsset,
  type GalleryVisibility,
  type ListAdminGalleryResult,
  type ListAdminTasksResult,
  type ModelCost,
  type RetentionAnalytics,
  type TaskDiagnosticError,
} from './types'
import { createAdminGalleryRepository, type AdminGalleryRepository } from './admin-gallery'
import { createAdminTaskRepository, type AdminTaskRepository } from './admin-tasks'
import { createAnalyticsRepository, type AnalyticsRepository } from './analytics'

export interface AdminRepository {
  readonly gallery: AdminGalleryRepository
  readonly tasks: AdminTaskRepository
  readonly analytics: AnalyticsRepository
}

import { type BailianStudioDb } from '@bailian-studio/db'

export function createAdminRepository(db: BailianStudioDb): AdminRepository {
  return {
    gallery: createAdminGalleryRepository(db),
    tasks: createAdminTaskRepository(db),
    analytics: createAnalyticsRepository(db),
  }
}
