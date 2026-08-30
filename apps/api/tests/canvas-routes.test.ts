import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasRepository } from '@bailian-studio/canvas-repository'
import { CanvasRepositoryError } from '@bailian-studio/canvas-repository'
import type { CanvasDocument, CanvasSnapshot, CanvasVersion } from '@bailian-studio/canvas-contracts'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

const user = { id: 'user-canvas', email: 'canvas@example.test', displayName: null, role: 'user' as const }
const snapshot: CanvasSnapshot = { nodes: [], edges: [] }
let document: CanvasDocument
let versions: CanvasVersion[]

function createFakeCanvasRepository(): CanvasRepository {
  return {
    async listDocuments() { return { items: [document] } },
    async createDocument() { return document },
    async getDocument() { return document },
    async saveDocument(input) {
      if (input.expectedRevision !== document.revision) {
        throw new CanvasRepositoryError('CANVAS_REVISION_CONFLICT', 'revision conflict')
      }
      document = {
        ...document,
        revision: document.revision + 1,
        snapshot: input.snapshot,
        currentVersionId: `version-${document.revision + 1}`,
      }
      return document
    },
    async listVersions() { return versions },
    async restoreVersion() { return document },
  }
}

beforeEach(() => {
  document = {
    id: 'canvas-1',
    title: '测试画布',
    revision: 1,
    snapshot,
    currentVersionId: 'version-1',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
  versions = [{ id: 'version-1', documentId: 'canvas-1', version: 1, snapshot, createdAt: document.createdAt }]
})

describe('canvas routes', () => {
  it('reads and saves a canvas using the authenticated user', async () => {
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
    }).app

    const response = await app.handle(new Request('http://localhost/api/canvases/canvas-1', {
      headers: { cookie: 'bailian_studio_session=fake-token' },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data.document.id).toBe('canvas-1')

    const saved = await app.handle(new Request('http://localhost/api/canvases/canvas-1', {
      method: 'PATCH',
      headers: {
        cookie: 'bailian_studio_session=fake-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedRevision: 1, snapshot }),
    }))
    expect(saved.status).toBe(200)
    expect((await saved.json()).data.document.revision).toBe(2)
  })

  it('maps optimistic concurrency conflicts to 409', async () => {
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
    }).app
    await app.handle(new Request('http://localhost/api/canvases/canvas-1', {
      method: 'PATCH',
      headers: {
        cookie: 'bailian_studio_session=fake-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedRevision: 1, snapshot }),
    }))
    const response = await app.handle(new Request('http://localhost/api/canvases/canvas-1', {
      method: 'PATCH',
      headers: {
        cookie: 'bailian_studio_session=fake-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedRevision: 1, snapshot }),
    }))
    expect(response.status).toBe(409)
  })
})
