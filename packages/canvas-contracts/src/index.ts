import { z } from 'zod'

const finiteNumber = z.number().finite()

/** React Flow 节点的持久化子集；运行时字段（例如 signed URL）不属于协议。 */
export const CanvasNodeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(50),
  position: z.object({
    x: finiteNumber,
    y: finiteNumber,
  }).strict(),
  data: z.record(z.string(), z.unknown()),
}).strict()

export const CanvasEdgeSchema = z.object({
  id: z.string().trim().min(1).max(160),
  source: z.string().trim().min(1).max(120),
  target: z.string().trim().min(1).max(120),
  sourceHandle: z.string().max(80).nullable().optional(),
  targetHandle: z.string().max(80).nullable().optional(),
  animated: z.boolean().optional(),
  type: z.string().max(50).optional(),
}).strict()

export const CanvasSnapshotSchema = z.object({
  nodes: z.array(CanvasNodeSchema).max(500),
  edges: z.array(CanvasEdgeSchema).max(1000),
}).strict()

export const CanvasDocumentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
}).strict()

export const CanvasDocumentSchema = CanvasDocumentSummarySchema.extend({
  snapshot: CanvasSnapshotSchema,
  createdAt: z.string(),
  currentVersionId: z.string(),
}).strict()

export const CanvasVersionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  version: z.number().int().positive(),
  snapshot: CanvasSnapshotSchema,
  createdAt: z.string(),
}).strict()

export const CreateCanvasInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  snapshot: CanvasSnapshotSchema.optional(),
}).strict()

export const SaveCanvasInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
  snapshot: CanvasSnapshotSchema,
}).strict()

export const RestoreCanvasInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  versionId: z.string().trim().min(1).max(160),
}).strict()

export const ListCanvasesResponseSchema = z.object({
  items: z.array(CanvasDocumentSummarySchema),
}).strict()

export const CanvasDocumentResponseSchema = z.object({
  document: CanvasDocumentSchema,
}).strict()

export const CanvasVersionsResponseSchema = z.object({
  versions: z.array(CanvasVersionSchema),
}).strict()

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
