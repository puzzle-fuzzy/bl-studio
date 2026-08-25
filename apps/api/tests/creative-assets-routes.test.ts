import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  resetGenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from '@bailian-studio/generation-repository'
import { createCreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let isolated!: IsolatedGenerationRepository
let currentUserId = 'creative-api-owner'
let app: ReturnType<typeof createTestApp>['app']

const authService = createFakeAuthService(() => ({
  id: currentUserId,
  email: `${currentUserId}@example.com`,
  displayName: null,
  role: 'user',
}))

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

beforeAll(async () => {
  isolated = await createIsolatedGenerationRepository({ max: 2 })
})

afterAll(async () => {
  await isolated.close()
})

beforeEach(async () => {
  currentUserId = 'creative-api-owner'
  await resetGenerationRepositoryTestDb(isolated.db)
  await createTestUser(isolated.db, currentUserId)
  app = createTestApp({
    authService,
    creativeAssetRepository: createCreativeAssetRepository({ db: isolated.db }),
  }).app
})

describe('creative asset routes', () => {
  it('creates a project asset, adds a version reference, and approves it', async () => {
    const projectResponse = await app.handle(authed('http://localhost/api/creative/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '夜行者' }),
    }))
    expect(projectResponse.status).toBe(200)
    const projectBody = await projectResponse.json() as { data: { project: { id: string } } }
    const projectId = projectBody.data.project.id

    const assetResponse = await app.handle(authed('http://localhost/api/creative/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        type: 'character',
        name: '林默',
      }),
    }))
    expect(assetResponse.status).toBe(200)
    const assetBody = await assetResponse.json() as { data: { asset: { id: string } } }
    const assetId = assetBody.data.asset.id

    const versionResponse = await app.handle(authed(`http://localhost/api/creative/assets/${assetId}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ semanticSpec: { identity: { gender: 'male' } }, generationRecipe: {} }),
    }))
    expect(versionResponse.status).toBe(200)
    const versionBody = await versionResponse.json() as { data: { asset: { versions: Array<{ id: string }> } } }
    const versionId = versionBody.data.asset.versions[0]?.id
    if (versionId === undefined) throw new Error('expected version id')

    await isolated.repository.createUserAsset({
      id: 'api-character-front',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      mimeType: 'image/png',
    })
    const referenceResponse = await app.handle(authed(`http://localhost/api/creative/assets/versions/${versionId}/references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userAssetId: 'api-character-front', role: 'front', position: 0, metadata: {} }),
    }))
    expect(referenceResponse.status).toBe(200)

    for (const status of ['generating', 'candidate', 'approved']) {
      const response = await app.handle(authed(`http://localhost/api/creative/assets/versions/${versionId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      }))
      expect(response.status).toBe(200)
    }

    const detailResponse = await app.handle(authed(`http://localhost/api/creative/projects/${projectId}`))
    const detailBody = await detailResponse.json() as { data: { project: { assets: Array<{ id: string; approvedVersionId?: string }> } } }
    expect(detailResponse.status).toBe(200)
    expect(detailBody.data.project.assets[0]).toMatchObject({ id: assetId, approvedVersionId: versionId })
  })

  it('does not expose another user project', async () => {
    const response = await app.handle(authed('http://localhost/api/creative/projects/missing-project'))
    expect(response.status).toBe(404)
    const body = await response.json() as { error: { code: string } }
    expect(body.error.code).toBe('CREATIVE_PROJECT_NOT_FOUND')
  })
})
