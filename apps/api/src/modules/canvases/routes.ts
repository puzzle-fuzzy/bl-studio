import { createHash, randomUUID } from 'node:crypto'
import { encodeSSE } from '@bailian-studio/event-bus'
import {
  CreateCanvasInputSchema,
  CanvasExecutionTaskInputSchema,
  ExecuteCanvasInputSchema,
  RetryCanvasNodeInputSchema,
  RestoreCanvasInputSchema,
  SaveCanvasInputSchema,
} from '@bailian-studio/canvas-contracts'
import {
  CanvasExecutionError,
  compileCanvasGraph,
  prepareCanvasNodeRerun,
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

const ListCanvasExecutionsQuerySchema = ListCanvasesQuerySchema.extend({
  cursor: z.string().trim().min(1).max(1024).optional(),
})

const CANVAS_SSE_POLL_INTERVAL_MS = 1_000
const CANVAS_SSE_HEARTBEAT_INTERVAL_MS = 15_000
const CANVAS_SSE_RESPONSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const

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
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas not found: ${params.id}`)
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

      const assetKinds = await resolveCanvasAssetKinds(document.snapshot.nodes, deps, user.id)
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
        assertCanvasExecutionTaskOwner(existing, user.id, document.id, document.revision)
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
          cachePolicy: 'reuse',
        },
        attempts: 0,
        maxAttempts: Math.min(10_000, Math.max(1_000, plan.nodes.length * 50)),
        nextRunAt: now,
        recordId: document.id,
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
        assertCanvasExecutionTaskOwner(concurrent, user.id, document.id, document.revision)
        created = concurrent
      }
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(created) },
      }
    })
    .post('/:id/executions/:taskId/nodes/:nodeId/retry', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(RetryCanvasNodeInputSchema, body)
      const sourceTask = await deps.taskQueueRepository.getTask(params.taskId)
      if (sourceTask === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas execution not found: ${params.taskId}`)
      }
      assertCanvasExecutionTaskOwner(sourceTask, user.id, params.id)
      if (sourceTask.status !== 'succeeded' && sourceTask.status !== 'failed' && sourceTask.status !== 'cancelled') {
        throw new CanvasExecutionError(
          'CANVAS_EXECUTION_NOT_RETRYABLE',
          `Canvas execution ${sourceTask.id} is still active`,
          { taskId: sourceTask.id, status: sourceTask.status },
        )
      }

      const sourceInput = CanvasExecutionTaskInputSchema.parse(sourceTask.input)
      const rerunInput = prepareCanvasNodeRerun(sourceInput, params.nodeId, sourceTask.status)
      const taskId =
        input.idempotencyKey === undefined
          ? `canvas_node_execution_${randomUUID()}`
          : `canvas_node_execution_${createHash('sha256')
              .update(`${user.id}:${params.id}:${params.taskId}:${params.nodeId}:${input.idempotencyKey}`)
              .digest('hex')
              .slice(0, 48)}`
      const existing = await deps.taskQueueRepository.getTask(taskId)
      if (existing !== undefined) {
        assertCanvasExecutionTaskOwner(existing, user.id, params.id, sourceInput.documentRevision)
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
          ...rerunInput,
          cachePolicy: 'refresh',
          rerun: {
            sourceExecutionId: sourceTask.id,
            nodeId: params.nodeId,
          },
        },
        attempts: 0,
        maxAttempts: Math.min(10_000, Math.max(1_000, rerunInput.plan.nodes.length * 50)),
        nextRunAt: now,
        recordId: params.id,
        userId: user.id,
        traceId: randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      let created: TaskRecord
      try {
        created = await deps.taskQueueRepository.enqueueTask(task)
      } catch (error) {
        if (input.idempotencyKey === undefined) throw error
        const concurrent = await deps.taskQueueRepository.getTask(taskId)
        if (concurrent === undefined) throw error
        assertCanvasExecutionTaskOwner(concurrent, user.id, params.id, sourceInput.documentRevision)
        created = concurrent
      }
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(created) },
      }
    })
    .get('/:id/executions', async ({ request, params, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const document = await deps.canvasRepository.getDocument({
        userId: user.id,
        documentId: params.id,
      })
      if (document === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas not found: ${params.id}`)
      }
      const input = validateInput(ListCanvasExecutionsQuerySchema, query)
      const page = await deps.taskQueueRepository.listTasks({
        userId: user.id,
        type: 'canvas.execute',
        domain: 'canvas',
        inputField: { key: 'documentId', value: params.id },
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return {
        success: true,
        data: {
          items: page.items.map(toCanvasExecutionSummary),
          ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        },
      }
    })
    .get('/:id/executions/:taskId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const task = await deps.taskQueueRepository.getTask(params.taskId)
      if (task === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas execution not found: ${params.taskId}`)
      }
      assertCanvasExecutionTaskOwner(task, user.id, params.id)
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(task) },
      }
    })
    .get('/:id/executions/:taskId/events', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const task = await deps.taskQueueRepository.getTask(params.taskId)
      if (task === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas execution not found: ${params.taskId}`)
      }
      assertCanvasExecutionTaskOwner(task, user.id, params.id)

      const initialSummary = toCanvasExecutionSummary(task)
      const lastEventId = request.headers.get('last-event-id')?.trim()
      const encoder = new TextEncoder()
      let cancelStream = () => {}

      return new Response(
        new ReadableStream({
          start(controller) {
            let closed = false
            let currentEventId = canvasExecutionEventId(task)
            let pollTimer: ReturnType<typeof setTimeout> | undefined
            let heartbeatTimer: ReturnType<typeof setInterval> | undefined

            const cleanup = () => {
              if (closed) return
              closed = true
              if (pollTimer !== undefined) clearTimeout(pollTimer)
              if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
            }
            const close = () => {
              cleanup()
              try {
                controller.close()
              } catch {
                // 客户端断开时，ReadableStream 可能已经被底层关闭。
              }
            }
            const send = (message: { id?: string; event: string; data: unknown }) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(encodeSSE(message)))
              } catch {
                close()
              }
            }
            cancelStream = cleanup

            send({
              event: 'connected',
              data: { serverTime: new Date().toISOString() },
            })
            if (lastEventId !== currentEventId) {
              send({
                id: currentEventId,
                event: 'canvas.execution',
                data: initialSummary,
              })
            }

            const isTerminal =
              initialSummary.status === 'succeeded' ||
              initialSummary.status === 'failed' ||
              initialSummary.status === 'cancelled'
            if (isTerminal) {
              close()
              return
            }

            const poll = async (): Promise<void> => {
              if (closed) return
              try {
                const nextTask = await deps.taskQueueRepository.getTask(task.id)
                if (nextTask === undefined) {
                  close()
                  return
                }
                assertCanvasExecutionTaskOwner(nextTask, user.id, params.id)
                const nextEventId = canvasExecutionEventId(nextTask)
                if (nextEventId !== currentEventId) {
                  currentEventId = nextEventId
                  const nextSummary = toCanvasExecutionSummary(nextTask)
                  send({
                    id: nextEventId,
                    event: 'canvas.execution',
                    data: nextSummary,
                  })
                  if (
                    nextSummary.status === 'succeeded' ||
                    nextSummary.status === 'failed' ||
                    nextSummary.status === 'cancelled'
                  ) {
                    close()
                    return
                  }
                }
              } catch {
                // 保持流打开，下一轮继续读取；权限/数据异常不会把内部细节发给客户端。
              }
              if (!closed) pollTimer = setTimeout(() => void poll(), CANVAS_SSE_POLL_INTERVAL_MS)
            }

            heartbeatTimer = setInterval(() => {
              send({
                event: 'heartbeat',
                data: { serverTime: new Date().toISOString() },
              })
            }, CANVAS_SSE_HEARTBEAT_INTERVAL_MS)
            pollTimer = setTimeout(() => void poll(), CANVAS_SSE_POLL_INTERVAL_MS)
          },
          cancel() {
            cancelStream()
          },
        }),
        { headers: CANVAS_SSE_RESPONSE_HEADERS },
      )
    })
    .post('/:id/executions/:taskId/cancel', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const task = await deps.taskQueueRepository.getTask(params.taskId)
      if (task === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas execution not found: ${params.taskId}`)
      }
      assertCanvasExecutionTaskOwner(task, user.id, params.id)
      if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') {
        return {
          success: true,
          data: { execution: toCanvasExecutionSummary(task) },
        }
      }

      const now = new Date().toISOString()
      const cancelled = await deps.taskQueueRepository.cancelTask({
        taskId: task.id,
        userId: user.id,
        type: 'canvas.execute',
        now,
        updatedBy: user.id,
        error: {
          category: 'cancelled',
          message: 'Canvas execution cancelled by user',
          retriable: false,
          code: 'CANVAS_EXECUTION_CANCELLED',
        },
      })
      const finalTask = cancelled ?? (await deps.taskQueueRepository.getTask(task.id))
      if (finalTask === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas execution not found: ${params.taskId}`)
      }
      assertCanvasExecutionTaskOwner(finalTask, user.id, params.id)
      if (finalTask.status === 'cancelled') {
        await cancelCanvasNodeGenerations(finalTask, user.id, deps)
      }
      return {
        success: true,
        data: { execution: toCanvasExecutionSummary(finalTask) },
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
        return requestErrorResponseBody(request, 'CANVAS_NOT_FOUND', 'Canvas not found', set)
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

function canvasExecutionEventId(task: TaskRecord): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: task.id,
        status: task.status,
        updatedAt: task.updatedAt,
        input: task.input,
        errorJson: task.errorJson ?? null,
      }),
    )
    .digest('hex')
}

async function cancelCanvasNodeGenerations(task: TaskRecord, userId: string, deps: ApiDependencies): Promise<void> {
  const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input)
  if (!parsed.success) return
  const generationIds = new Set(
    Object.values(parsed.data.nodeRuns)
      .map(run => run.generationId)
      .filter((generationId): generationId is string => generationId !== undefined),
  )
  await Promise.allSettled(
    [...generationIds].map(recordId =>
      deps.generationRepository.requestGenerationCancel({
        recordId,
        userId,
      }),
    ),
  )
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
    for (const assetId of value) if (typeof assetId === 'string' && assetId.trim().length > 0) ids.add(assetId)
  }
  const entries = await Promise.all(
    [...ids].map(async assetId => {
      const asset = await deps.assetRepository.getUserAsset({
        userId,
        assetId,
      })
      return asset === undefined ? undefined : ([assetId, asset.kind] as const)
    }),
  )
  return new Map(entries.filter((entry): entry is readonly [string, CanvasExecutionAssetKind] => entry !== undefined))
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
    (expectedRevision !== undefined && parsed.data.documentRevision !== expectedRevision)
  ) {
    throw new CanvasRepositoryError('CANVAS_NOT_FOUND', 'Canvas execution not found')
  }
}

function toCanvasExecutionSummary(task: TaskRecord) {
  const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input)
  if (!parsed.success) {
    throw new CanvasExecutionError('CANVAS_EXECUTION_INVALID_TASK_INPUT', 'Canvas execution task input is invalid')
  }
  return {
    id: task.id,
    documentId: parsed.data.documentId,
    documentRevision: parsed.data.documentRevision,
    status: task.status,
    nodeStatuses: parsed.data.plan.nodes.map(node => {
      const run = parsed.data.nodeRuns[node.nodeId]
      return {
        nodeId: node.nodeId,
        status: run?.status ?? 'queued',
        ...(run?.generationId === undefined ? {} : { generationId: run.generationId }),
        ...(run?.assetIds === undefined ? {} : { assetIds: run.assetIds }),
        ...(run?.error === undefined ? {} : { error: run.error }),
      }
    }),
    ...(task.errorJson?.message === undefined ? {} : { error: task.errorJson.message }),
    ...(parsed.data.rerun === undefined ? {} : { rerun: parsed.data.rerun }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}
