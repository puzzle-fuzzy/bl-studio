import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, userAssets, users } from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { CreativeAssetRepositoryError } from '../src/errors'
import { createCreativeAssetRepository } from '../src/repository'

const now = new Date('2026-08-25T00:00:00.000Z')
const ownerId = 'creative-owner'
const otherUserId = 'creative-other'

let isolated!: Awaited<ReturnType<typeof createIsolatedTestDb>>
let db!: ReturnType<typeof createDb>
let repository!: ReturnType<typeof createCreativeAssetRepository>

async function createUser(id: string): Promise<void> {
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    passwordHash: 'test-hash',
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
  })
}

async function createReferenceSource(id: string, userId = ownerId): Promise<void> {
  await db.insert(userAssets).values({
    id,
    userId,
    kind: 'image',
    source: 'upload',
    status: 'ready',
    mimeType: 'image/png',
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })
}

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
  repository = createCreativeAssetRepository({ db })
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

beforeEach(async () => {
  await resetBailianStudioTestDb(db)
  await createUser(ownerId)
  await createUser(otherUserId)
})

describe('creative asset repository', () => {
  it('organizes reusable assets in projects and persists approved references', async () => {
    const project = await repository.createProject({ userId: ownerId, title: '夜行者', now: now.toISOString() })
    const asset = await repository.createAsset({
      userId: ownerId,
      projectId: project.id,
      type: 'character',
      name: '林默',
      description: '男主角',
      now: now.toISOString(),
    })
    expect(project.assets).toHaveLength(0)
    expect(asset.projects).toHaveLength(1)
    expect(asset.projects[0]?.projectId).toBe(project.id)

    const versioned = await repository.createVersion({
      userId: ownerId,
      assetId: asset.id,
      semanticSpec: { identity: { gender: 'male' } },
      generationRecipe: { modelId: 'image-model' },
      now: now.toISOString(),
    })
    const versionId = versioned.versions[0]?.id
    if (versionId === undefined) throw new Error('expected asset version')
    await createReferenceSource('character-front')
    const referenced = await repository.addReference({
      userId: ownerId,
      assetVersionId: versionId,
      userAssetId: 'character-front',
      role: 'front',
      position: 0,
      metadata: { source: 'uploaded' },
      now: now.toISOString(),
    })
    expect(referenced.versions[0]?.references[0]?.role).toBe('front')

    await repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'generating', now: now.toISOString() })
    await repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'candidate', now: now.toISOString() })
    const approved = await repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'approved', now: now.toISOString() })
    expect(approved.status).toBe('active')
    expect(approved.approvedVersionId).toBe(versionId)
    expect(approved.versions[0]?.status).toBe('approved')

    await expect(repository.addReference({
      userId: ownerId,
      assetVersionId: versionId,
      userAssetId: 'character-front',
      role: 'three_quarter',
      position: 0,
      metadata: {},
    })).rejects.toMatchObject({ code: 'CREATIVE_ASSET_VERSION_STATE_INVALID' })
  })

  it('reuses an asset across projects without allowing cross-user access', async () => {
    const first = await repository.createProject({ userId: ownerId, title: '项目 A' })
    const second = await repository.createProject({ userId: ownerId, title: '项目 B' })
    const asset = await repository.createAsset({ userId: ownerId, type: 'environment', name: '医院走廊' })
    await repository.attachAsset({ userId: ownerId, projectId: first.id, assetId: asset.id })
    await repository.attachAsset({ userId: ownerId, projectId: second.id, assetId: asset.id })

    const detail = await repository.getAsset({ userId: ownerId, assetId: asset.id })
    expect(detail?.projects).toHaveLength(2)
    expect((await repository.listAssets({ userId: ownerId, projectId: second.id })).items.map(item => item.id)).toEqual([asset.id])
    expect(await repository.getProject({ userId: otherUserId, projectId: first.id })).toBeUndefined()
    await expect(repository.attachAsset({ userId: otherUserId, projectId: first.id, assetId: asset.id }))
      .rejects.toMatchObject({ code: 'CREATIVE_PROJECT_NOT_FOUND' })
  })

  it('enforces reference role compatibility and rejects empty approval', async () => {
    const asset = await repository.createAsset({ userId: ownerId, type: 'prop', name: '打火机' })
    const versioned = await repository.createVersion({
      userId: ownerId,
      assetId: asset.id,
      semanticSpec: {},
      generationRecipe: {},
    })
    const versionId = versioned.versions[0]?.id
    if (versionId === undefined) throw new Error('expected asset version')

    await expect(repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'generating' }))
      .resolves.toBeDefined()
    await expect(repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'candidate' }))
      .resolves.toBeDefined()
    await expect(repository.transitionVersion({ userId: ownerId, assetVersionId: versionId, status: 'approved' }))
      .rejects.toMatchObject({ code: 'CREATIVE_ASSET_VERSION_STATE_INVALID' })
  })

  it('restores a soft-deleted project membership instead of duplicating it', async () => {
    const project = await repository.createProject({ userId: ownerId, title: '归档整理' })
    const asset = await repository.createAsset({ userId: ownerId, type: 'style', name: '冷色电影感' })
    await repository.attachAsset({ userId: ownerId, projectId: project.id, assetId: asset.id })
    await repository.detachAsset({ userId: ownerId, projectId: project.id, assetId: asset.id })
    const restored = await repository.attachAsset({ userId: ownerId, projectId: project.id, assetId: asset.id, sortOrder: 3 })
    expect(restored.projects).toHaveLength(1)
    expect(restored.projects[0]?.sortOrder).toBe(3)
  })

  it('requires a ready owned image for a reference', async () => {
    const asset = await repository.createAsset({ userId: ownerId, type: 'character', name: '角色' })
    const versioned = await repository.createVersion({ userId: ownerId, assetId: asset.id, semanticSpec: {}, generationRecipe: {} })
    const versionId = versioned.versions[0]?.id
    if (versionId === undefined) throw new Error('expected asset version')
    await createReferenceSource('other-user-image', otherUserId)
    await expect(repository.addReference({
      userId: ownerId,
      assetVersionId: versionId,
      userAssetId: 'other-user-image',
      role: 'front',
      position: 0,
      metadata: {},
    })).rejects.toBeInstanceOf(CreativeAssetRepositoryError)
  })
})
