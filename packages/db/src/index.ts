/**
 * @bailian-studio/db 的公共出口（barrel）。
 *
 * 集中导出 schema 表定义、Drizzle 连接工厂（createDb）以及 Postgres
 * LISTEN/NOTIFY 工具与测试辅助函数。下游的 repository/auth 包从这里引用
 * schema 与工厂，而 apps/api、apps/worker 则通过 repository/auth 的
 * `create…FromUrl(url)` 间接消费，避免直接 import 本包（package 边界规则）。
 */

export { createDb, type CreateDbOptions, type BailianStudioDb, type BailianStudioDbTransaction } from './client'
export { DEV_DATABASE_URL, TEST_DATABASE_URL } from './defaults'
export {
  assetDerivatives,
  canvasDocumentVersions,
  canvasDocuments,
  auditEventOutbox,
  auditLogs,
  authActionTokens,
  creditAccounts,
  creditLedgerEntries,
  contentReports,
  creativeAssets,
  creativeAssetVersions,
  creativeAssetReferences,
  creativeAssetCollectionBatches,
  creativeAssetCollectionBatchItems,
  creativeProjects,
  creativeProjectAssets,
  creativeGenerationContexts,
  creativeGenerationContextAssets,
  creativeGenerationContextReferences,
  directorAssets,
  directorCharacters,
  directorLocations,
  directorPhaseRuns,
  directorPhaseStates,
  directorProjects,
  directorScriptMessages,
  directorScriptVersions,
  directorShots,
	directorEntityCandidates,
  generationArtifacts,
  generationEvents,
  generationFavorites,
  generationInputAssets,
  generationLikes,
  generationRecords,
  generationShares,
  mediaJobs,
  modelCosts,
  notifications,
  promptLibrary,
  providerRequestAudits,
  sessions,
  taskRecords,
  usageRecords,
  userAssets,
  userFeedback,
  users,
  workerHeartbeats,
} from './schema'
export {
  createNotificationListener,
  type CreateNotificationListenerOptions,
  type NotificationListener,
} from './notify'
// 测试专用工具（resetBailianStudioTestDb / createIsolatedTestDb / requireDatabaseUrl /
// IsolatedTestDb）不放在生产 barrel 里——通过子路径 `@bailian-studio/db/test` 显式引用，
// 避免生产消费者把「重置测试库」能力拉进运行时模块图。

// ── task_records 序列化（P1-C 唯一实现，取代三份分叉副本） ──
export { taskInsertValues, type TaskRecordInput } from './task-serialize'

// ── 审计动作枚举（P1-J 唯一事实源） ──
export { AUDIT_ACTIONS, type AuditAction } from './audit-actions'
