import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AssetCapabilitiesSchema,
  AssetResponseSchema,
  AuthResponseSchema,
  BailianContractStatusSchema,
  CreateGenerationResponseSchema,
  CreateMediaJobResponseSchema,
  GenerationEstimateResponseSchema,
  GenerationRecordSchema,
  GenerationShareResponseSchema,
  ListArtifactsResponseSchema,
  ListGenerationArtifactsResponseSchema,
  ListGenerationsResponseSchema,
  MediaJobResponseSchema,
  ModelCatalogItemSchema,
  ModelCatalogResponseSchema,
  PublicSharedGenerationResponseSchema,
  RegistrationResponseSchema,
  UsageSummaryResponseSchema,
} from '../packages/api-client/src/schemas'
import type { AuthService } from '../packages/auth/src'
import { createCreditLedger, type CreditLedger } from '../packages/credit-ledger/src'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  type IsolatedGenerationRepository,
} from '../packages/generation-repository/src'
import { createMediaRepositoryFromUrl, type MediaRepositoryTestDb } from '../packages/media-repository/src'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '../packages/storage/src'
import { createTestApp } from '../apps/api/src/test-app'

interface SchemaLike<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } }
}

async function readSuccessData<T>(response: Response, schema: SchemaLike<T>): Promise<T> {
  const body = await response.json() as unknown
  if (typeof body !== 'object' || body === null || !('success' in body) || body.success !== true || !('data' in body)) {
    throw new Error(`Expected a success envelope, received: ${JSON.stringify(body)}`)
  }

  const parsed = schema.safeParse(body.data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Success payload did not match api-client schema: ${issues}`)
  }
  return parsed.data
}

const CONTRACT_USER_ID = 'api_contract_user'
const CONTRACT_IMAGE_ASSET_ID = 'contract_image_asset'
const CONTRACT_DELETABLE_ASSET_ID = 'contract_deletable_asset'
const CONTRACT_USER = {
  id: CONTRACT_USER_ID,
  email: 'api-contract@example.test',
  displayName: 'API Contract',
  role: 'user' as const,
  emailVerifiedAt: '2026-07-25T00:00:00.000Z',
  bannedAt: null,
}

let generationHandle: IsolatedGenerationRepository
let mediaHandle: MediaRepositoryTestDb
let creditLedger: CreditLedger
let app: ReturnType<typeof createTestApp>['app']

const contractAuthService: AuthService = {
  register: async () => ({
    status: 'verification_required',
    email: 'a***********@example.test',
    resendAvailableAt: '2026-07-25T00:01:00.000Z',
  }),
  verifyEmail: async () => ({ token: 'contract-token', user: CONTRACT_USER, expiresAt: new Date(Date.now() + 3600_000) }),
  resendVerification: async () => ({ accepted: true }),
  login: async () => ({ token: 'contract-token', user: CONTRACT_USER, expiresAt: new Date(Date.now() + 3600_000) }),
  loginWithGithub: async () => ({ token: 'contract-token', user: CONTRACT_USER, expiresAt: new Date(Date.now() + 3600_000) }),
  forgotPassword: async () => ({ accepted: true }),
  resetPassword: async () => {},
  changePassword: async () => ({ token: 'contract-token', user: CONTRACT_USER, expiresAt: new Date(Date.now() + 3600_000) }),
  verifyToken: async token => token === 'contract-token'
    ? { user: CONTRACT_USER, sessionId: 'contract-session' }
    : undefined,
  revokeSessionByToken: async () => {},
  revokeAllSessionsByToken: async () => {},
  adminCreateUser: async input => ({
    id: 'contract-admin-user',
    email: input.email,
    displayName: input.displayName ?? null,
    role: input.role ?? 'user',
    emailVerifiedAt: CONTRACT_USER.emailVerifiedAt,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    bannedAt: CONTRACT_USER.bannedAt,
  }),
  listActiveUsers: async () => ({
    items: [{
      id: CONTRACT_USER.id,
      email: CONTRACT_USER.email,
      displayName: CONTRACT_USER.displayName,
      role: CONTRACT_USER.role,
      emailVerifiedAt: CONTRACT_USER.emailVerifiedAt,
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-25T00:00:00.000Z',
      bannedAt: CONTRACT_USER.bannedAt,
    }],
    nextCursor: undefined,
  }),
  adminStats: async () => ({ registrationsByDay: [], totalUsers: 1 }),
  adminGetUser: async id => ({
    id,
    email: CONTRACT_USER.email,
    displayName: CONTRACT_USER.displayName,
    role: CONTRACT_USER.role,
    emailVerifiedAt: CONTRACT_USER.emailVerifiedAt,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    bannedAt: CONTRACT_USER.bannedAt,
  }),
  adminUpdateUser: async (id, input) => ({
    id,
    email: CONTRACT_USER.email,
    displayName: input.displayName ?? CONTRACT_USER.displayName,
    role: input.role ?? CONTRACT_USER.role,
    emailVerifiedAt: CONTRACT_USER.emailVerifiedAt,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    bannedAt: CONTRACT_USER.bannedAt,
  }),
  softDeleteUser: async () => {},
  adminBanUser: async () => {},
  adminUnbanUser: async () => {},
  adminBatchBanUsers: async () => {},
  adminBatchUnbanUsers: async () => {},
  adminBatchDeleteUsers: async () => {},
}

class ContractStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''

  writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.resolve({
      provider: 'local',
      key: input.key,
      byteSize: input.body.byteLength,
    })
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    return Promise.resolve(`/signed/${input.key}?ttl=${input.expiresInSeconds}`)
  }
}

function authenticatedRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=contract-token')
  return new Request(url, { ...init, headers })
}

function authenticatedJsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return authenticatedRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function createGenerationThroughApi() {
  const response = await app.handle(authenticatedJsonRequest('http://localhost/api/generations', {
    modelId: 'qwen-image',
    params: { prompt: 'contract lantern', n: 1, size: '1328*1328' },
  }))
  return readSuccessData(response, CreateGenerationResponseSchema)
}

beforeAll(async () => {
  generationHandle = await createIsolatedGenerationRepository({ max: 2 })
  mediaHandle = createMediaRepositoryFromUrl(generationHandle.databaseUrl)
  await createTestUser(generationHandle.db, CONTRACT_USER_ID, CONTRACT_USER.email)
  creditLedger = createCreditLedger({ db: generationHandle.db })
  await creditLedger.grant({
    userId: CONTRACT_USER_ID,
    amountCents: 1_000_000,
    reason: 'API contract fixture',
    idempotencyKey: 'fixture:api-contract-user',
    actorUserId: CONTRACT_USER_ID,
  })
  await generationHandle.repository.createUserAsset({
    id: 'contract_video_asset',
    userId: CONTRACT_USER_ID,
    kind: 'video',
    source: 'upload',
    fileName: 'video.mp4',
    mimeType: 'video/mp4',
    byteSize: 10,
    storageProvider: 'local',
    storageKey: 'user_uploads/api_contract_user/video.mp4',
  })
  await generationHandle.repository.createUserAsset({
    id: CONTRACT_IMAGE_ASSET_ID,
    userId: CONTRACT_USER_ID,
    kind: 'image',
    source: 'upload',
    fileName: 'reference.png',
    mimeType: 'image/png',
    byteSize: 20,
    storageProvider: 'local',
    storageKey: 'user_uploads/api_contract_user/reference.png',
  })
  await generationHandle.repository.createUserAsset({
    id: CONTRACT_DELETABLE_ASSET_ID,
    userId: CONTRACT_USER_ID,
    kind: 'image',
    source: 'link',
    fileName: 'delete-me.png',
    mimeType: 'image/png',
    originalUrl: 'https://fixture.invalid/delete-me.png',
  })

  app = createTestApp({
    authService: contractAuthService,
    generationRepository: generationHandle.repository,
    creditLedger,
    mediaRepository: mediaHandle.repository,
    storage: new ContractStorage(),
  }).app
})

afterAll(async () => {
  await mediaHandle.close()
  await generationHandle.close()
})

describe('API success response contracts', () => {
  it('keeps registration verification-required responses aligned with api-client', async () => {
    const response = await app.handle(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'new-contract-user@example.test',
        password: 'contract-password',
        displayName: 'New Contract User',
      }),
    }))
    const data = await readSuccessData(response, RegistrationResponseSchema)

    expect(response.status).toBe(200)
    expect(data.registration).toEqual({
      status: 'verification_required',
      email: 'a***********@example.test',
      resendAvailableAt: '2026-07-25T00:01:00.000Z',
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('keeps the auth response aligned with api-client', async () => {
    const response = await app.handle(authenticatedJsonRequest('http://localhost/api/auth/login', {
      email: CONTRACT_USER.email,
      password: 'contract-password',
    }))
    const data = await readSuccessData(response, AuthResponseSchema)

    expect(response.status).toBe(200)
    expect(data.user).toEqual(CONTRACT_USER)
  })

  it('keeps the model catalog response aligned with api-client', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/catalog'))
    const data = await readSuccessData(response, ModelCatalogResponseSchema)

    expect(response.status).toBe(200)
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items.map(item => item.id)).toContain('qwen-image')
    expect(
      data.items.find(item => item.id === 'qwen-image')?.operation,
    ).toBe('image.text-to-image')
  })

  it('keeps the single-model response aligned with api-client', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/qwen-image'))
    const data = await readSuccessData(response, ModelCatalogItemSchema)

    expect(response.status).toBe(200)
    expect(data.id).toBe('qwen-image')
    expect(data.operation).toBe('image.text-to-image')
    expect(data.parameters.length).toBeGreaterThan(0)
  })

  it('keeps the covered Bailian contract response aligned with api-client', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/bailian-contract'))
    const data = await readSuccessData(response, BailianContractStatusSchema)

    expect(response.status).toBe(200)
    expect(data.coverage.coveredRequirements).toBe(data.coverage.totalRequirements)
    expect(data.coverage.coveredConsumerIds).toHaveLength(data.coverage.totalRequirements)
    expect(data.coverage.legacyRequirements).toBe(0)
  })

  it('keeps the generation estimate response aligned with api-client', async () => {
    const response = await app.handle(authenticatedJsonRequest('http://localhost/api/generations/estimate', {
      modelId: 'qwen-image',
      params: { prompt: 'contract estimate', n: 1, size: '1328*1328' },
    }))
    const data = await readSuccessData(response, GenerationEstimateResponseSchema)

    expect(response.status).toBe(200)
    expect(data.estimate.modelId).toBe('qwen-image')
    expect(data.estimate.currency).toBe('CNY')
  })

  it('keeps generation assetRefs responses aligned with api-client', async () => {
    const response = await app.handle(authenticatedJsonRequest('http://localhost/api/generations', {
      modelId: 'qwen-image-edit',
      params: { prompt: 'turn the selected asset into a paper collage' },
      assetRefs: { image: CONTRACT_IMAGE_ASSET_ID },
    }))
    const data = await readSuccessData(response, CreateGenerationResponseSchema)

    expect(response.status).toBe(200)
    expect(data.record.modelId).toBe('qwen-image-edit')
    expect(data.record.assetRefs).toEqual({ image: [CONTRACT_IMAGE_ASSET_ID] })
    expect(data.record.inputParams).not.toHaveProperty('image')
  })

  it('keeps generation create, detail, and list responses aligned with api-client', async () => {
    const created = await createGenerationThroughApi()
    const detailResponse = await app.handle(authenticatedRequest(`http://localhost/api/generations/${created.record.id}`))
    const detail = await readSuccessData(detailResponse, GenerationRecordSchema)
    const listResponse = await app.handle(authenticatedRequest('http://localhost/api/generations'))
    const list = await readSuccessData(listResponse, ListGenerationsResponseSchema)

    expect(created.record.id).toBe(detail.id)
    expect(detail.userId).toBe(CONTRACT_USER_ID)
    expect(list.items.map(item => item.id)).toContain(created.record.id)
  })

  it('keeps artifact library and per-generation responses aligned with api-client', async () => {
    const created = await generationHandle.repository.createGeneration({
      userId: CONTRACT_USER_ID,
      modelId: 'qwen-image',
      params: { prompt: 'artifact contract', n: 1, size: '1328*1328' },
    })
    await generationHandle.repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      enqueueArtifactPersist: false,
      output: {
        artifacts: [{
          kind: 'image',
          sourceUrl: 'https://fixture.invalid/artifact-contract.png',
          mimeType: 'image/png',
        }],
      },
    })

    const recordArtifactsResponse = await app.handle(authenticatedRequest(
      `http://localhost/api/generations/${created.record.id}/artifacts`,
    ))
    const recordArtifacts = await readSuccessData(recordArtifactsResponse, ListGenerationArtifactsResponseSchema)
    const libraryResponse = await app.handle(authenticatedRequest('http://localhost/api/artifacts'))
    const library = await readSuccessData(libraryResponse, ListArtifactsResponseSchema)

    expect(recordArtifacts.items).toHaveLength(1)
    expect(recordArtifacts.items[0]?.recordId).toBe(created.record.id)
    expect(library.items.map(item => item.recordId)).toContain(created.record.id)
  })

  it('keeps asset capabilities aligned with api-client', async () => {
    const response = await app.handle(authenticatedRequest('http://localhost/api/assets/capabilities'))
    const data = await readSuccessData(response, AssetCapabilitiesSchema)

    expect(response.status).toBe(200)
    expect(data.maxAssetSizeBytes).toBeGreaterThan(0)
    expect(data.allowedMimeTypes).toContain('image/png')
    expect(data.allowedKinds).toEqual(['image', 'video', 'audio', 'text', 'archive'])
  })

  it('keeps asset detail responses aligned with api-client', async () => {
    const response = await app.handle(authenticatedRequest(
      `http://localhost/api/assets/${CONTRACT_IMAGE_ASSET_ID}`,
    ))
    const data = await readSuccessData(response, AssetResponseSchema)

    expect(response.status).toBe(200)
    expect(data.asset).toMatchObject({
      id: CONTRACT_IMAGE_ASSET_ID,
      kind: 'image',
      source: 'upload',
      fileName: 'reference.png',
      mimeType: 'image/png',
      byteSize: 20,
    })
    expect(data.asset.url).toBe('/signed/user_uploads/api_contract_user/reference.png?ttl=3600')
  })

  it('keeps successful asset deletion as an empty 204 response', async () => {
    const response = await app.handle(authenticatedRequest(
      `http://localhost/api/assets/${CONTRACT_DELETABLE_ASSET_ID}`,
      { method: 'DELETE' },
    ))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    await expect(generationHandle.repository.getUserAsset({
      userId: CONTRACT_USER_ID,
      assetId: CONTRACT_DELETABLE_ASSET_ID,
    })).resolves.toBeUndefined()
  })

  it('keeps usage, media, and share responses aligned with api-client', async () => {
    const usageResponse = await app.handle(authenticatedRequest('http://localhost/api/usage'))
    const usage = await readSuccessData(usageResponse, UsageSummaryResponseSchema)

    const mediaResponse = await app.handle(authenticatedJsonRequest('http://localhost/api/media/jobs', {
      operation: 'video.extract_audio',
      source: { assetId: 'contract_video_asset', kind: 'video' },
    }))
    const media = await readSuccessData(mediaResponse, CreateMediaJobResponseSchema)
    const mediaDetailResponse = await app.handle(authenticatedRequest(
      `http://localhost/api/media/jobs/${media.job.id}`,
    ))
    const mediaDetail = await readSuccessData(mediaDetailResponse, MediaJobResponseSchema)

    const created = await createGenerationThroughApi()
    const shareResponse = await app.handle(authenticatedJsonRequest(
      `http://localhost/api/generations/${created.record.id}/share`,
      {},
    ))
    const share = await readSuccessData(shareResponse, GenerationShareResponseSchema)
    const publicResponse = await app.handle(new Request(
      `http://localhost/api/shares/generations/${share.share.id}`,
    ))
    const publicShared = await readSuccessData(publicResponse, PublicSharedGenerationResponseSchema)

    expect(usage.usage.currency).toBe('CNY')
    expect(media.task.type).toBe('media.process')
    expect(mediaDetail.job.id).toBe(media.job.id)
    expect(publicShared.share.id).toBe(share.share.id)
    expect(publicShared.record.id).toBe(created.record.id)
  })
})
