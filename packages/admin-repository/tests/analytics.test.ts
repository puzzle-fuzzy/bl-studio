import { createDb, generationRecords, taskRecords, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAnalyticsRepository, type AnalyticsRepository } from '../src'

let isolated: IsolatedTestDb | undefined
let db: BailianStudioDb | undefined
let analytics: AnalyticsRepository

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
      },
    },
    cachePolicy: 'reuse',
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
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        updatedAt: new Date('2026-08-11T00:00:00.000Z'),
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

    analytics = createAnalyticsRepository(db)
  })

  afterAll(async () => {
    await db?.close()
    await isolated?.close()
  })

  it('aggregates Canvas executions by trace and excludes cache hits from generation costs', async () => {
    const result = await analytics.getCanvasCostAnalytics({ from: WINDOW_FROM, to: WINDOW_TO })

    expect(result).toEqual({
      executions: 2,
      generationCalls: 1,
      cacheHitNodes: 1,
      accountedCents: 120,
      byModel: [{ modelId: 'qwen-image', calls: 1, accountedCents: 120 }],
    })
  })
})
