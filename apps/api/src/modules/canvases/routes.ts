import { createHash, randomUUID } from 'node:crypto'
import {
  CreateCanvasInputSchema,
  CanvasExecutionTaskInputSchema,
  ExecuteCanvasInputSchema,
  RestoreCanvasInputSchema,
  SaveCanvasInputSchema,
} from '@bailian-studio/canvas-contracts'
import {
  CanvasExecutionError,
  compileCanvasGraph,
  type CanvasExecutionAssetKind,
} from '@bailian-studio/canvas-execution'
import { CanvasRepositoryError } from '@bailian-studio/canvas-repository'
import { validateInput } from '@bailian-studio/shared'
import { Elysia } from 'elysia'
import { z } from 'zod'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { requireAuthUser } from '../auth/session'

const ListCanvasesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

export function createCanvasRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/canvases' })
    .get('/', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { limit } = validateInput(ListCanvasesQuerySchema, query)
      return {
        success: true,
        data: await deps.canvasRepository.listDocuments({
          userId: user.id,
          ...(limit !== undefined ? { limit } : {}),
        }),
      }
    })
    .post('/', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateCanvasInputSchema, body)
      const document = await deps.canvasRepository.createDocument({
        userId: user.id,
        ...input,
      })
      return { success: true, data: { document } }
    })
    .post('/:id/execute', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ExecuteCanvasInputSchema, body)
      const document = await deps.canvasRepository.getDocument({
        userId: user.id,
        documentId: params.id,
      })
      if (document === undefined) {
        throw new CanvasRepositoryError(
          'CANVAS_NOT_FOUND',
          `Canvas not found: ${params.id}`,
        )
      }
      if (document.revision !== input.expectedRevision) {
        throw new CanvasRepositoryError(
          'CANVAS_REVISION_CONFLICT',
          `Canvas revision conflict: expected ${input.expectedRevision}, current ${document.revision}`,
          {
            expectedRevision: input.expectedRevision,
            currentRevision: document.revision,
          },
        )
      }

      const assetKinds = await resolveCanvasAssetKinds(
        document.snapshot.nodes,
        deps,
        user.id,
      )
      const plan = compileCanvasGraph({
        snapshot: document.snapshot,
        assetKinds,
      })
      const taskId =
        input.idempotencyKey === undefined
          ? `canvas_execution_${randomUUID()}`
          : `canvas_execution_${createHash('sha256').update(`${user.id}:${document.id}:${input.idempotencyKey}`).digest('hex').slice(0, 48)}`
      const existing = await deps.taskQueueRepository.getTask(taskId)
      if (existing !== undefined) {
        assertCanvasExecutionTaskOwner(
          existing,
          user.id,
          document.id,
          document.revision,
        )
        return {
          success: true,
          data: { execution: toCanvasExecutionSummary(existing) },
        }
      }

      const now = new Date().toISOString()
      const task: TaskRecord = {
        id: taskId,
        type: 'canvas.execute',
        domain: 'canvas',
        status: 'queued',
        priority: 1,
        input: {
          documentId: document.id,
          documentRevision: document.revision,
          plan,
          nodeRuns: {},
        },
        attempts: 0,
        maxAttempts: Math.min(10_000, Math.max(1_000, plan.nodes.length * 50)),
        nextRunAt: now,
        userId: user.id,
        traceId: randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      let created: TaskRecord
      try {
        created = await deps.taskQueueRepository.enqueueTask(task)
      } catch (error) {
        // The deterministic ID is the database-backed idempotency boundary;
        // a concurrent request may win the insert between our read and write.
        if (input.idempotencyKey === undefined) throw error
        const concurrent = await deps.taskQueueRepository.getTask(taskId)
        if (concurrent === undefined) throw error
        assertCanvasExecutionTaskOwner(
          concurrent,
          user.id,
          document.id,
          document.revision,
        )
        created = concurrent
      }
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(created) },
      }
    })
    .get('/:id/executions/:taskId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const task = await deps.taskQueueRepository.getTask(params.taskId)
      if (task === undefined) {
        throw new CanvasRepositoryError(
          'CANVAS_NOT_FOUND',
          `Canvas execution not found: ${params.taskId}`,
        )
      }
      assertCanvasExecutionTaskOwner(task, user.id, params.id)
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(task) },
      }
    })
    .get('/:id', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const document = await deps.canvasRepository.getDocument({
        userId: user.id,
        documentId: params.id,
      })
      if (document === undefined) {
        set.status = 404
        return requestErrorResponseBody(
          request,
          'CANVAS_NOT_FOUND',
          'Canvas not found',
          set,
        )
      }
      return { success: true, data: { document } }
    })
    .patch('/:id', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(SaveCanvasInputSchema, body)
      const document = await deps.canvasRepository.saveDocument({
        userId: user.id,
        documentId: params.id,
        ...input,
      })
      return { success: true, data: { document } }
    })
    .get('/:id/versions', async ({ request, params, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { limit } = validateInput(ListCanvasesQuerySchema, query)
      const versions = await deps.canvasRepository.listVersions({
        userId: user.id,
        documentId: params.id,
        ...(limit !== undefined ? { limit } : {}),
      })
      return { success: true, data: { versions } }
    })
    .post('/:id/restore', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(RestoreCanvasInputSchema, body)
      const document = await deps.canvasRepository.restoreVersion({
        userId: user.id,
        documentId: params.id,
        ...input,
      })
      return { success: true, data: { document } }
    })
}

async function resolveCanvasAssetKinds(
  nodes: ReadonlyArray<{ data: Record<string, unknown> }>,
  deps: ApiDependencies,
  userId: string,
): Promise<Map<string, CanvasExecutionAssetKind>> {
  const ids = new Set<string>()
  for (const node of nodes) {
    const value = node.data['referenceAssetIds']
    if (!Array.isArray(value)) continue
    for (const assetId of value)
      if (typeof assetId === 'string' && assetId.trim().length > 0)
        ids.add(assetId)
  }
  const entries = await Promise.all(
    [...ids].map(async (assetId) => {
      const asset = await deps.assetRepository.getUserAsset({
        userId,
        assetId,
      })
      return asset === undefined ? undefined : ([assetId, asset.kind] as const)
    }),
  )
  return new Map(
    entries.filter(
      (entry): entry is readonly [string, CanvasExecutionAssetKind] =>
        entry !== undefined,
    ),
  )
}

function assertCanvasExecutionTaskOwner(
  task: TaskRecord,
  userId: string,
  documentId: string,
  expectedRevision?: number,
): void {
  const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input)
  if (
    task.type !== 'canvas.execute' ||
    task.domain !== 'canvas' ||
    task.userId !== userId ||
    !parsed.success ||
    parsed.data.documentId !== documentId ||
    (expectedRevision !== undefined &&
      parsed.data.documentRevision !== expectedRevision)
  ) {
    throw new CanvasRepositoryError(
      'CANVAS_NOT_FOUND',
      'Canvas execution not found',
    )
  }
}

function toCanvasExecutionSummary(task: TaskRecord) {
  const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input)
  if (!parsed.success) {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_INVALID_TASK_INPUT',
      'Canvas execution task input is invalid',
    )
  }
  return {
    id: task.id,
    documentId: parsed.data.documentId,
    documentRevision: parsed.data.documentRevision,
    status: task.status,
    nodeStatuses: parsed.data.plan.nodes.map((node) => {
      const run = parsed.data.nodeRuns[node.nodeId]
      return {
        nodeId: node.nodeId,
        status: run?.status ?? 'queued',
        ...(run?.generationId === undefined
          ? {}
          : { generationId: run.generationId }),
        ...(run?.assetIds === undefined ? {} : { assetIds: run.assetIds }),
        ...(run?.error === undefined ? {} : { error: run.error }),
      }
    }),
    ...(task.errorJson?.message === undefined
      ? {}
      : { error: task.errorJson.message }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}
