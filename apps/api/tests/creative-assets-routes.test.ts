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

    await isolated.assetRepository.createUserAsset({
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
    const referenceBody = await referenceResponse.json() as { data: { asset: { versions: Array<{ references: Array<{ id: string }> }> } } }
    const referenceId = referenceBody.data.asset.versions[0]?.references[0]?.id
    if (referenceId === undefined) throw new Error('expected reference id')
    const removeReferenceResponse = await app.handle(authed(`http://localhost/api/creative/assets/versions/${versionId}/references/${referenceId}`, {
      method: 'DELETE',
    }))
    expect(removeReferenceResponse.status).toBe(200)

    const readdReferenceResponse = await app.handle(authed(`http://localhost/api/creative/assets/versions/${versionId}/references`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userAssetId: 'api-character-front', role: 'front', position: 0, metadata: {} }),
    }))
    expect(readdReferenceResponse.status).toBe(200)

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

  it('atomically collects a stored generation artifact and safely retries by idempotency key', async () => {
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

    const requestBody = {
      type: 'character',
      name: '林默',
      description: '男主角',
      sourceGenerationId: created.record.id,
      semanticSpec: { identity: { name: '林默' } },
      generationRecipe: { source: 'generation' },
      references: [{ artifactId: artifact.id, role: 'front', position: 0, metadata: { source: 'generated' } }],
    }
    const invalidResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-invalid' },
      body: JSON.stringify({ ...requestBody, name: '不应创建', references: [{ ...requestBody.references[0], artifactId: 'missing-artifact' }] }),
    }))
    expect(invalidResponse.status).toBe(400)
    const afterInvalidResponse = await app.handle(authed('http://localhost/api/creative/assets'))
    const afterInvalidBody = await afterInvalidResponse.json() as { data: { items: Array<{ id: string }> } }
    expect(afterInvalidBody.data.items).toHaveLength(0)

    const collectResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-generation-1' },
      body: JSON.stringify(requestBody),
    }))
    const collectBody = await collectResponse.json() as {
      data: {
        asset: {
          id: string
          preview?: { url?: string }
          versions: Array<{ status: string; sourceGenerationId?: string; references: Array<{ userAssetId: string }> }>
        }
      }
    }

    expect(collectResponse.status).toBe(200)
    const firstAssetId = collectBody.data.asset.id
    expect(collectBody.data.asset.preview?.url).toContain(`/signed/generations/${created.record.id}/`)
    expect(collectBody.data.asset.versions[0]).toMatchObject({
      status: 'draft',
      sourceGenerationId: created.record.id,
      references: [{ userAssetId: `asset_generation_${artifact.id}` }],
    })

    const retryResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-generation-1' },
      body: JSON.stringify(requestBody),
    }))
    const retryBody = await retryResponse.json() as { data: { asset: { id: string; versions: unknown[] } } }
    expect(retryResponse.status).toBe(200)
    expect(retryBody.data.asset.id).toBe(firstAssetId)
    expect(retryBody.data.asset.versions).toHaveLength(1)

    const conflictResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-generation-1' },
      body: JSON.stringify({ ...requestBody, name: '林默（修改请求）' }),
    }))
    const conflictBody = await conflictResponse.json() as { error: { code: string } }
    expect(conflictResponse.status).toBe(409)
    expect(conflictBody.error.code).toBe('CREATIVE_IDEMPOTENCY_CONFLICT')

    const batchBody = { items: [
      { ...requestBody, name: '林默批次' },
      { ...requestBody, name: '医院走廊批次', type: 'environment', references: [{ ...requestBody.references[0], role: 'wide' } ] },
    ] }
    const invalidBatchResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-batch-invalid' },
      body: JSON.stringify({ ...batchBody, items: [...batchBody.items, { ...requestBody, name: '无效项', references: [{ ...requestBody.references[0], artifactId: 'missing-artifact' }] }] }),
    }))
    expect(invalidBatchResponse.status).toBe(400)
    const afterInvalidBatchResponse = await app.handle(authed('http://localhost/api/creative/assets'))
    const afterInvalidBatchBody = await afterInvalidBatchResponse.json() as { data: { items: Array<{ id: string }> } }
    expect(afterInvalidBatchBody.data.items).toHaveLength(1)

    const batchResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-batch-1' },
      body: JSON.stringify(batchBody),
    }))
    const batchResponseBody = await batchResponse.json() as { data: { batch: { id: string; assets: Array<{ id: string; versions: unknown[] }> } } }
    expect(batchResponse.status).toBe(200)
    expect(batchResponseBody.data.batch.assets).toHaveLength(2)
    expect(batchResponseBody.data.batch.assets.every(asset => asset.versions.length === 1)).toBe(true)

    const batchRetryResponse = await app.handle(authed('http://localhost/api/creative/assets/collect-from-generation/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'collect-batch-1' },
      body: JSON.stringify(batchBody),
    }))
    const batchRetryBody = await batchRetryResponse.json() as { data: { batch: { id: string; assets: Array<{ id: string }> } } }
    expect(batchRetryResponse.status).toBe(200)
    expect(batchRetryBody.data.batch.id).toBe(batchResponseBody.data.batch.id)
    expect(batchRetryBody.data.batch.assets.map(asset => asset.id)).toEqual(batchResponseBody.data.batch.assets.map(asset => asset.id))
  })
})
