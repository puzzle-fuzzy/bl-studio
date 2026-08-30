import { auditEventOutbox, type BailianStudioDbTransaction } from '@bailian-studio/db'
import { nextAuditEventOutboxId } from './id'

/**
 * 创意资产收录成功后写入的最小审计摘要。
 *
 * 这里只允许持久化操作结果和数量，不接收 prompt、storage key、完整请求体
 * 或 signed URL；outbox consumer 未来可用同一个事件 id 幂等投递到 audit_logs。
 */
export interface CreativeAssetCollectionAuditOutboxInput {
  userId: string
  targetType: 'creative_asset' | 'creative_asset_collection_batch'
  targetId: string
  assetCount: number
  occurredAt: Date
}

export async function enqueueCreativeAssetCollectionAudit(
  tx: BailianStudioDbTransaction,
  input: CreativeAssetCollectionAuditOutboxInput,
): Promise<void> {
  await tx.insert(auditEventOutbox).values({
    id: nextAuditEventOutboxId(),
    userId: input.userId,
    action: 'asset.import',
    outcome: 'succeeded',
    targetType: input.targetType,
    targetId: input.targetId,
    metadataJson: {
      source: 'generation',
      assetCount: input.assetCount,
    },
    occurredAt: input.occurredAt,
    status: 'pending',
    attempts: 0,
    availableAt: input.occurredAt,
    createdBy: input.userId,
    updatedBy: input.userId,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  })
}
