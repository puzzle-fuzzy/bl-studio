import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedMediaRepository,
  createMediaTestUser,
  createMediaTestAsset,
  resetMediaRepositoryTestDb,
  type IsolatedMediaRepository,
} from '@bailian-studio/media-repository'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let iso!: IsolatedMediaRepository
let currentUserId = 'owner'
let app: ReturnType<typeof createTestApp>['app']

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUserId,
  email: `${currentUserId}@e.test`,
  displayName: null,
  role: 'user',
}))

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

function json(url: string, body: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  headers.set('content-type', 'application/json')
  return new Request(url, {
    ...init,
    headers,
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  iso = await createIsolatedMediaRepository()
})

beforeEach(async () => {
  currentUserId = 'owner'
  await resetMediaRepositoryTestDb(iso.db)
  await createMediaTestUser(iso.db, { id: 'owner', email: 'owner@example.com' })
  await createMediaTestUser(iso.db, { id: 'other', email: 'other@example.com' })
  await createMediaTestAsset(iso.db, { id: 'asset_video', userId: 'owner' })
  app = createTestApp({ authService: fakeAuthService, mediaRepository: iso.repository }).app
})

afterAll(async () => {
  await iso.close()
})

describe('media routes', () => {
  it('requires auth for media job creation', async () => {
    const response = await app.handle(new Request('http://localhost/api/media/jobs', { method: 'POST' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('creates a video extract-audio job for the session user', async () => {
    const response = await app.handle(json('http://localhost/api/media/jobs', {
      operation: 'video.extract_audio',
      source: {
        assetId: 'asset_video',
        kind: 'video',
        fileName: 'video.mp4',
      },
      options: { format: 'wav' },
    }, { method: 'POST' }))
    const body = await response.json() as {
      success: true
      data: {
        job: { id: string; userId: string; operation: string; status: string; sourceAssetId?: string; input: unknown }
        task: { id: string; type: string; domain: string; status: string }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.job.id).toMatch(/^media_job_/)
    expect(body.data.job.userId).toBe('owner')
    expect(body.data.job.operation).toBe('video.extract_audio')
    expect(body.data.job.status).toBe('queued')
    expect(body.data.job.sourceAssetId).toBe('asset_video')
    expect(body.data.task.type).toBe('media.process')
    expect(body.data.task.domain).toBe('media')
    expect(body.data.task.status).toBe('queued')
  })

  it('reads only owned media jobs', async () => {
    const created = await iso.repository.createMediaJob({
      userId: 'owner',
      operation: 'video.extract_audio',
      source: { assetId: 'asset_video', kind: 'video' },
    })

    const read = await app.handle(authed(`http://localhost/api/media/jobs/${created.job.id}`))
    const readBody = await read.json() as { success: true; data: { job: { id: string } } }
    expect(read.status).toBe(200)
    expect(readBody.data.job.id).toBe(created.job.id)

    currentUserId = 'other'
    const hidden = await app.handle(authed(`http://localhost/api/media/jobs/${created.job.id}`, {
      headers: { 'x-request-id': 'media-inline-error-1' },
    }))
    const hiddenBody = await hidden.json() as { success: false; error: { code: string }; traceId?: string }
    expect(hidden.status).toBe(404)
    expect(hiddenBody.error.code).toBe('MEDIA_JOB_NOT_FOUND')
    expect(hiddenBody.traceId).toBe('media-inline-error-1')
  })

  it('rejects unsupported media operations with 400', async () => {
    const response = await app.handle(json('http://localhost/api/media/jobs', {
      operation: 'video.extract_subtitles',
      source: { assetId: 'asset_video', kind: 'video' },
    }, { method: 'POST' }))

    expect(response.status).toBe(400)
  })
})
