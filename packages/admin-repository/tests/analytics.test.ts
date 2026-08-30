import { createDb, generationRecords, taskRecords, userAssets, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminTaskRepository, createAnalyticsRepository, type AdminTaskRepository, type AnalyticsRepository } from '../src'

let isolated: IsolatedTestDb | undefined
let db: BailianStudioDb | undefined
let analytics: AnalyticsRepository
let adminTasks: AdminTaskRepository

const USER_ID = 'admin-analytics-test'
const WINDOW_FROM = '2026-08-01T00:00:00.000Z'
const WINDOW_TO = '2026-09-01T00:00:00.000Z'

function canvasInput(cacheHit: boolean): Record<string, unknown> {
  return {
    documentId: 'canvas-1',
    documentRevision: 1,
    plan: {
      nodes: [{
        nodeId: 'node-1',
        kind: 'image',
        modelId: 'qwen-image',
        params: { prompt: 'a test image' },
        assetRefs: {},
        dependencyBindings: {},
        dependsOn: [],
      }],
    },
      nodeRuns: {
        'node-1': {
          status: 'succeeded',
          generationId: cacheHit ? 'generation-from-previous-execution' : 'generation-current',
          cacheHit,
          assetIds: ['asset_generation_current'],
        },
    },
    cachePolicy: 'reuse',
  }
}

function failedCanvasInput(): Record<string, unknown> {
  return {
    ...canvasInput(false),
    nodeRuns: {
      'node-1': {
        status: 'failed',
        errorCode: 'CANVAS_PROVIDER_FAILED',
        error: 'provider failed',
      },
    },
  }
}

describe('admin analytics repository', () => {
  beforeAll(async () => {
    isolated = await createIsolatedTestDb()
    db = createDb({ url: isolated.url, max: 2 })
    await db.insert(users).values({
      id: USER_ID,
      email: 'admin-analytics-test@example.test',
      passwordHash: 'test-hash',
      createdAt: new Date(WINDOW_FROM),
      updatedAt: new Date(WINDOW_FROM),
    })

    await db.insert(taskRecords).values([
      {
        id: 'canvas-task-1',
        type: 'canvas.execute',
        domain: 'canvas',
        status: 'succeeded',
        priority: 1,
        inputJson: canvasInput(false),
        attempts: 1,
        maxAttempts: 10,
        nextRunAt: new Date('2026-08-10T00:00:00.000Z'),
        traceId: 'canvas-trace-1',
        userId: USER_ID,
        recordId: 'canvas-1',
        startedAt: new Date('2026-08-10T00:00:00.000Z'),
        completedAt: new Date('2026-08-10T00:00:02.000Z'),
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
        updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      },
      {
        id: 'canvas-task-2',
        type: 'canvas.execute',
        domain: 'canvas',
        status: 'succeeded',
        priority: 1,
        inputJson: canvasInput(true),
        attempts: 1,
        maxAttempts: 10,
        nextRunAt: new Date('2026-08-11T00:00:00.000Z'),
        traceId: 'canvas-trace-2',
        userId: USER_ID,
        recordId: 'canvas-1',
        startedAt: new Date('2026-08-11T00:00:00.000Z'),
        completedAt: new Date('2026-08-11T00:00:04.000Z'),
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        updatedAt: new Date('2026-08-11T00:00:00.000Z'),
      },
      {
        id: 'canvas-task-failed',
        type: 'canvas.execute',
        domain: 'canvas',
        status: 'failed',
        priority: 1,
        inputJson: failedCanvasInput(),
        attempts: 3,
        maxAttempts: 3,
        nextRunAt: new Date('2026-08-12T00:00:04.000Z'),
        startedAt: new Date('2026-08-12T00:00:00.000Z'),
        completedAt: new Date('2026-08-12T00:00:04.000Z'),
        errorJson: {
          category: 'provider',
          message: 'Canvas execution failed',
          retriable: false,
          code: 'CANVAS_EXECUTION_FAILED',
        },
        traceId: 'canvas-trace-failed',
        userId: USER_ID,
        recordId: 'canvas-1',
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        updatedAt: new Date('2026-08-12T00:00:04.000Z'),
      },
      {
        id: 'canvas-task-outside-window',
        type: 'canvas.execute',
        domain: 'canvas',
        status: 'succeeded',
        priority: 1,
        inputJson: canvasInput(false),
        attempts: 1,
        maxAttempts: 10,
        nextRunAt: new Date('2026-09-02T00:00:00.000Z'),
        traceId: 'canvas-trace-outside-window',
        userId: USER_ID,
        recordId: 'canvas-1',
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    ])

    await db.insert(generationRecords).values([
      {
        id: 'generation-current',
        userId: USER_ID,
        modelId: 'qwen-image',
        provider: 'dashscope',
        providerModel: 'qwen-image',
        category: 'image',
        inputParamsJson: { prompt: 'a test image' },
        status: 'succeeded',
        providerCancelStatus: 'not_requested',
        costEstimate: 100,
        costFinal: 120,
        traceId: 'canvas-trace-1',
        createdAt: new Date('2026-08-10T00:00:01.000Z'),
        updatedAt: new Date('2026-08-10T00:00:01.000Z'),
      },
      {
        id: 'generation-outside-window',
        userId: USER_ID,
        modelId: 'qwen-image',
        provider: 'dashscope',
        providerModel: 'qwen-image',
        category: 'image',
        inputParamsJson: { prompt: 'outside the window' },
        status: 'succeeded',
        providerCancelStatus: 'not_requested',
        costEstimate: 200,
        costFinal: 200,
        traceId: 'canvas-trace-outside-window',
        createdAt: new Date('2026-09-02T00:00:01.000Z'),
        updatedAt: new Date('2026-09-02T00:00:01.000Z'),
      },
    ])

    await db.insert(userAssets).values({
      id: 'asset_generation_current',
      userId: USER_ID,
      kind: 'image',
      source: 'generation',
      recordId: 'generation-current',
      modelId: 'qwen-image',
      storageProvider: 'local',
      storageKey: 'outputs/generation-current.png',
      mimeType: 'image/png',
      byteSize: 120,
      status: 'ready',
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: new Date('2026-08-10T00:00:02.000Z'),
      updatedAt: new Date('2026-08-10T00:00:02.000Z'),
    })

    analytics = createAnalyticsRepository(db)
    adminTasks = createAdminTaskRepository(db)
  })

  afterAll(async () => {
    await db?.close()
    await isolated?.close()
  })

  it('aggregates Canvas executions by trace and excludes cache hits from generation costs', async () => {
    const result = await analytics.getCanvasCostAnalytics({ from: WINDOW_FROM, to: WINDOW_TO })

    expect(result).toEqual({
      executions: 3,
      generationCalls: 1,
      cacheHitNodes: 1,
      accountedCents: 120,
      byModel: [{ modelId: 'qwen-image', calls: 1, accountedCents: 120 }],
    })
  })

  it('aggregates Canvas execution health, latency, and failure reasons', async () => {
    const result = await analytics.getCanvasOperationsAnalytics({ from: WINDOW_FROM, to: WINDOW_TO })

    expect(result).toEqual({
      executions: 3,
      byStatus: [
        { status: 'queued', count: 0 },
        { status: 'running', count: 0 },
        { status: 'succeeded', count: 2 },
        { status: 'failed', count: 1 },
        { status: 'cancelled', count: 0 },
      ],
      terminalExecutions: 3,
      succeededExecutions: 2,
      successRate: 2 / 3,
      averageDurationMs: 3_333,
      p95DurationMs: 4_000,
      failureReasons: [{ reason: 'CANVAS_EXECUTION_FAILED', count: 1 }],
      nodeFailureReasons: [{ reason: 'CANVAS_PROVIDER_FAILED', count: 1 }],
    })
  })

  it('returns a Canvas task context with node-level provenance and cost', async () => {
    const context = await adminTasks.getAdminTaskRequestContext('canvas-task-1')

    expect(context?.record).toBeUndefined()
    expect(context?.canvas).toMatchObject({
      documentId: 'canvas-1',
      documentRevision: 1,
      cachePolicy: 'reuse',
      assets: [{
        id: 'asset_generation_current',
        kind: 'image',
        source: 'generation',
        storageProvider: 'local',
        storageKey: 'outputs/generation-current.png',
      }],
      nodes: [{
        nodeId: 'node-1',
        modelId: 'qwen-image',
        status: 'succeeded',
        generationId: 'generation-current',
        cacheHit: false,
        generationStatus: 'succeeded',
        accountedCents: 120,
      }],
    })

    const cachedContext = await adminTasks.getAdminTaskRequestContext('canvas-task-2')
    expect(cachedContext?.canvas?.nodes[0]?.accountedCents).toBe(0)
  })
})
