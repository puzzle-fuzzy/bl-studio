import { z } from 'zod'

const finiteNumber = z.number().finite()

/** React Flow 节点的持久化子集；运行时字段（例如 signed URL）不属于协议。 */
export const CanvasNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(50),
    position: z
      .object({
        x: finiteNumber,
        y: finiteNumber,
      })
      .strict(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict()

export const CanvasEdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    source: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(120),
    sourceHandle: z.string().max(80).nullable().optional(),
    targetHandle: z.string().max(80).nullable().optional(),
    animated: z.boolean().optional(),
    type: z.string().max(50).optional(),
  })
  .strict()

export const CanvasSnapshotSchema = z
  .object({
    nodes: z.array(CanvasNodeSchema).max(500),
    edges: z.array(CanvasEdgeSchema).max(1000),
  })
  .strict()

export const CanvasDocumentSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    revision: z.number().int().positive(),
    updatedAt: z.string(),
  })
  .strict()

export const CanvasDocumentSchema = CanvasDocumentSummarySchema.extend({
  snapshot: CanvasSnapshotSchema,
  createdAt: z.string(),
  currentVersionId: z.string(),
}).strict()

export const CanvasVersionSchema = z
  .object({
    id: z.string(),
    documentId: z.string(),
    version: z.number().int().positive(),
    snapshot: CanvasSnapshotSchema,
    createdAt: z.string(),
  })
  .strict()

export const CreateCanvasInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    snapshot: CanvasSnapshotSchema.optional(),
  })
  .strict()

export const SaveCanvasInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(120).optional(),
    snapshot: CanvasSnapshotSchema,
  })
  .strict()

export const RestoreCanvasInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    versionId: z.string().trim().min(1).max(160),
  })
  .strict()

/**
 * Canvas execution is deliberately a separate transport contract from the
 * authored snapshot. The snapshot remains the user's editable source while
 * these shapes describe one immutable execution request and its task state.
 */
export const ExecuteCanvasInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
  })
  .strict()

export const RetryCanvasNodeInputSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
  })
  .strict()

export const CanvasExecutionPlanNodeSchema = z
  .object({
    nodeId: z.string().trim().min(1).max(120),
    kind: z.enum(['image', 'video']),
    modelId: z.string().trim().min(1).max(160),
    params: z.record(z.string(), z.unknown()),
    /** Static user asset IDs selected in the authored snapshot. */
    assetRefs: z.record(z.string(), z.array(z.string().trim().min(1).max(160))),
    /** Parameter name → upstream node IDs, kept separate from static assets. */
    dependencyBindings: z.record(
      z.string(),
      z.array(z.string().trim().min(1).max(120)),
    ),
    dependsOn: z.array(z.string().trim().min(1).max(120)),
  })
  .strict()

export const CanvasExecutionPlanSchema = z
  .object({
    nodes: z.array(CanvasExecutionPlanNodeSchema).min(1).max(500),
  })
  .strict()

export const CanvasExecutionNodeRunSchema = z
  .object({
    status: z.enum(['queued', 'generating', 'succeeded', 'failed']),
    generationId: z.string().trim().min(1).max(160).optional(),
    assetIds: z.array(z.string().trim().min(1).max(160)).optional(),
    error: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()

export const CanvasExecutionTaskInputSchema = z
  .object({
    documentId: z.string().trim().min(1).max(160),
    documentRevision: z.number().int().positive(),
    plan: CanvasExecutionPlanSchema,
    nodeRuns: z.record(
      z.string().trim().min(1).max(120),
      CanvasExecutionNodeRunSchema,
    ),
    rerun: z
      .object({
        sourceExecutionId: z.string().trim().min(1).max(200),
        nodeId: z.string().trim().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict()

export const CanvasExecutionNodeStatusSchema = z
  .object({
    nodeId: z.string().trim().min(1).max(120),
    status: z.enum(['queued', 'generating', 'succeeded', 'failed']),
    generationId: z.string().trim().min(1).max(160).optional(),
    assetIds: z.array(z.string().trim().min(1).max(160)).optional(),
    error: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()

export const CanvasExecutionTaskSummarySchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    documentId: z.string().trim().min(1).max(160),
    documentRevision: z.number().int().positive(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    nodeStatuses: z.array(CanvasExecutionNodeStatusSchema).max(500),
    error: z.string().trim().min(1).max(2000).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export const CanvasExecutionTaskResponseSchema = z
  .object({
    execution: CanvasExecutionTaskSummarySchema,
  })
  .strict()

export const ListCanvasesResponseSchema = z
  .object({
    items: z.array(CanvasDocumentSummarySchema),
  })
  .strict()

export const CanvasDocumentResponseSchema = z
  .object({
    document: CanvasDocumentSchema,
  })
  .strict()

export const CanvasVersionsResponseSchema = z
  .object({
    versions: z.array(CanvasVersionSchema),
  })
  .strict()

export type CanvasNode = z.infer<typeof CanvasNodeSchema>
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>
export type CanvasSnapshot = z.infer<typeof CanvasSnapshotSchema>
export type CanvasDocumentSummary = z.infer<typeof CanvasDocumentSummarySchema>
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>
export type CanvasVersion = z.infer<typeof CanvasVersionSchema>
export type CreateCanvasInput = z.infer<typeof CreateCanvasInputSchema>
export type SaveCanvasInput = z.infer<typeof SaveCanvasInputSchema>
export type RestoreCanvasInput = z.infer<typeof RestoreCanvasInputSchema>
export type ListCanvasesResult = z.infer<typeof ListCanvasesResponseSchema>
export type CanvasVersionsResult = z.infer<typeof CanvasVersionsResponseSchema>
export type ExecuteCanvasInput = z.infer<typeof ExecuteCanvasInputSchema>
export type RetryCanvasNodeInput = z.infer<typeof RetryCanvasNodeInputSchema>
export type CanvasExecutionPlanNode = z.infer<
  typeof CanvasExecutionPlanNodeSchema
>
export type CanvasExecutionPlan = z.infer<typeof CanvasExecutionPlanSchema>
export type CanvasExecutionNodeRun = z.infer<
  typeof CanvasExecutionNodeRunSchema
>
export type CanvasExecutionTaskInput = z.infer<
  typeof CanvasExecutionTaskInputSchema
>
export type CanvasExecutionNodeStatus = z.infer<
  typeof CanvasExecutionNodeStatusSchema
>
export type CanvasExecutionTaskSummary = z.infer<
  typeof CanvasExecutionTaskSummarySchema
>
