import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  grantTestCredits,
  resetGenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from '@bailian-studio/generation-repository'
import { createCreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
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

class FakeStorageAdapter implements StorageAdapter {
  constructor(readonly provider: 'local' | 'oss' = 'local') {}
  readonly keyPrefix = ''

  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.reject(new Error('FakeStorageAdapter.writeObject is not used'))
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    const process = input.process === undefined ? '' : `&x-oss-process=${encodeURIComponent(input.process)}`
    return Promise.resolve(`/signed/${input.key}?ttl=${input.expiresInSeconds}${process}`)
  }
}

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
    storage: new FakeStorageAdapter('oss'),
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

  it('collects a stored generation artifact into a draft creative asset version', async () => {
    await grantTestCredits(isolated.db, currentUserId, 100_000)
    const created = await isolated.repository.createGeneration({
      userId: currentUserId,
      modelId: 'qwen-image',
      params: { prompt: 'portrait', n: 1, size: '1328*1328' },
    })
    await isolated.repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/portrait.png', mimeType: 'image/png' }] },
    })
    const [artifact] = await isolated.repository.listArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected generation artifact')
    await isolated.repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'oss',
      storageKey: `generations/${created.record.id}/${artifact.id}.png`,
      byteSize: 128,
      mimeType: 'image/png',
    })

    const assetResponse = await app.handle(authed('http://localhost/api/creative/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'character', name: '林默' }),
    }))
    const assetBody = await assetResponse.json() as { data: { asset: { id: string } } }
    const assetId = assetBody.data.asset.id

    const collectResponse = await app.handle(authed(`http://localhost/api/creative/assets/${assetId}/versions/from-generation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceGenerationId: created.record.id,
        semanticSpec: { identity: { name: '林默' } },
        generationRecipe: { source: 'generation' },
        references: [{ artifactId: artifact.id, role: 'front', position: 0, metadata: { source: 'generated' } }],
      }),
    }))
    const collectBody = await collectResponse.json() as {
      data: {
        asset: {
          preview?: { url?: string }
          versions: Array<{ status: string; sourceGenerationId?: string; references: Array<{ userAssetId: string }> }>
        }
      }
    }

    expect(collectResponse.status).toBe(200)
    expect(collectBody.data.asset.preview?.url).toContain(`/signed/generations/${created.record.id}/`)
    expect(collectBody.data.asset.versions[0]).toMatchObject({
      status: 'draft',
      sourceGenerationId: created.record.id,
      references: [{ userAssetId: `asset_generation_${artifact.id}` }],
    })
  })
})
