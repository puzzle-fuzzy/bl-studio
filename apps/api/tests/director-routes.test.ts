import { beforeEach, describe, expect, it } from 'vitest'
import type {
  DirectorRepository,
} from '@bailian-studio/director-repository'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'
import { DIRECTOR_PHASES, type DirectorAsset, type DirectorPhaseRun, type DirectorPhaseState, type DirectorProjectDetail, type DirectorProjectListResult, type DirectorShot } from '@bailian-studio/shared'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUserId = 'user-1'
let nextProjectId = 1
let projects: Array<{ userId: string; project: DirectorProjectDetail }> = []
let runs: Array<{ userId: string; run: DirectorPhaseRun }> = []

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUserId,
  email: `${currentUserId}@e.test`,
  displayName: null,
  role: 'user',
}))

function createPhaseStates(): DirectorPhaseState[] {
  return DIRECTOR_PHASES.map((phase, index) => ({
    phase,
    status: index === 0 ? 'ready' : 'not_started',
    version: 0,
    activeRunId: null,
    lastRunId: null,
    lastError: null,
    updatedAt: '2026-08-10T00:00:00.000Z',
  }))
}

function createProject(input: { title: string; storyText: string; synopsis?: string | null }): DirectorProjectDetail {
  const id = `director-${nextProjectId++}`
  return {
    id,
    title: input.title,
    storyText: input.storyText,
    synopsis: input.synopsis ?? null,
    status: 'draft',
    settings: {},
    scriptVersion: {
      id: `${id}-script-1`,
      version: 1,
      storyText: input.storyText,
      synopsis: input.synopsis ?? null,
      createdAt: '2026-08-10T00:00:00.000Z',
    },
    characters: [],
    locations: [],
    assets: [],
    shots: [],
    phases: createPhaseStates(),
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }
}

function createShot(projectId: string, status: DirectorShot['status'] = 'needs_review'): DirectorShot {
  return {
    id: `${projectId}-shot-1`,
    projectId,
    sourceRunId: null,
    sequence: 1,
    sceneNumber: 1,
    slugline: 'INT. TEST - DAY',
    narrative: '测试镜头叙事',
    camera: { shotSize: '中景', angle: '平视', movement: '固定', lens: '50mm', composition: '居中' },
    durationSeconds: 8,
    environmentPrompt: '测试环境',
    videoPrompt: '测试动作',
    negativePrompt: null,
    dialogue: null,
    referenceAssetIds: [],
    continuity: null,
    status,
    videoGenerationId: null,
    activeVideoAssetId: null,
    version: 1,
    staleAt: null,
    staleReason: null,
    error: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }
}

const fakeDirectorRepository: DirectorRepository = {
  async createProject(input) {
    const project = createProject(input)
    projects.push({ userId: input.userId, project })
    return project
  },
  async listProjects(input): Promise<DirectorProjectListResult> {
    return {
      items: projects
        .filter(item => item.userId === input.userId)
        .map(({ project }) => ({
          id: project.id,
          title: project.title,
          status: project.status,
          progress: {
            completed: project.phases.filter(phase => phase.status === 'completed').length,
            total: project.phases.length,
            currentPhase: project.phases.find(phase => phase.status !== 'completed')?.phase ?? null,
          },
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
    }
  },
  async getProject(input) {
    return projects.find(item => item.userId === input.userId && item.project.id === input.projectId)?.project
  },
  async updateProject(input) {
    const record = projects.find(item => item.userId === input.userId && item.project.id === input.projectId)
    if (record === undefined) throw new Error('project not found')
    record.project = {
      ...record.project,
      ...input.patch,
      synopsis: input.patch.synopsis === undefined ? record.project.synopsis : input.patch.synopsis,
      updatedAt: '2026-08-10T00:01:00.000Z',
    }
    return record.project
  },
  async attachAsset(input) {
    const record = projects.find(item => item.userId === input.userId && item.project.id === input.projectId)
    if (record === undefined) throw new Error('project not found')
    const asset: DirectorAsset = {
      id: `director-asset-${input.assetId}`,
      projectId: input.projectId,
      sourceRunId: null,
      kind: input.kind,
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerId ?? null,
      assetId: input.assetId,
      version: 1,
      metadata: input.metadata ?? {},
      staleAt: null,
      staleReason: null,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    }
    record.project = { ...record.project, assets: [...record.project.assets, asset] }
    return asset
  },
  async detachAsset(input) {
    const record = projects.find(item => item.userId === input.userId && item.project.id === input.projectId)
    if (record === undefined) throw new Error('project not found')
    record.project = { ...record.project, assets: record.project.assets.filter(asset => asset.id !== input.directorAssetId) }
    return record.project
  },
  async updateShot(input) {
    const record = projects.find(item => item.userId === input.userId && item.project.id === input.projectId)
    if (record === undefined) throw new Error('project not found')
    const current = record.project.shots.find(shot => shot.id === input.shotId)
    if (current === undefined) throw new Error('shot not found')
    const hasContentPatch = input.patch.narrative !== undefined
      || input.patch.camera !== undefined
      || input.patch.durationSeconds !== undefined
      || input.patch.referenceAssetIds !== undefined
      || input.patch.environmentPrompt !== undefined
      || input.patch.videoPrompt !== undefined
      || input.patch.negativePrompt !== undefined
      || input.patch.dialogue !== undefined
      || input.patch.continuity !== undefined
    if (current.status === 'locked' && (hasContentPatch || input.patch.status !== 'needs_review')) {
      throw new DirectorRepositoryError('DIRECTOR_SHOT_LOCKED', 'Locked director shots must be unlocked before editing')
    }
    const next: DirectorShot = {
      ...current,
      ...input.patch,
      camera: input.patch.camera ?? current.camera,
      durationSeconds: input.patch.durationSeconds === undefined ? current.durationSeconds : input.patch.durationSeconds,
      referenceAssetIds: input.patch.referenceAssetIds === undefined ? current.referenceAssetIds : [...new Set(input.patch.referenceAssetIds)],
      environmentPrompt: input.patch.environmentPrompt === undefined ? current.environmentPrompt : input.patch.environmentPrompt,
      videoPrompt: input.patch.videoPrompt === undefined ? current.videoPrompt : input.patch.videoPrompt,
      negativePrompt: input.patch.negativePrompt === undefined ? current.negativePrompt : input.patch.negativePrompt,
      dialogue: input.patch.dialogue === undefined ? current.dialogue : input.patch.dialogue,
      continuity: input.patch.continuity === undefined ? current.continuity : input.patch.continuity,
      status: input.patch.status ?? 'needs_review',
      updatedAt: '2026-08-10T00:02:00.000Z',
    }
    record.project = { ...record.project, shots: record.project.shots.map(shot => shot.id === next.id ? next : shot) }
    return next
  },
  async startShotVideo(input) {
    const record = projects.find(item => item.userId === input.userId && item.project.id === input.projectId)
    if (record === undefined) throw new Error('project not found')
    const shot = record.project.shots.find(item => item.id === input.shotId)
    if (shot === undefined) throw new Error('shot not found')
    return { ...shot, status: 'generating', videoGenerationId: input.generationId }
  },
  async markShotVideoFailed() {
    return false
  },
  async finalizeShotVideo() {
    return false
  },
  async finalizeDirectorMusic() {
    return undefined
  },
  async requestPhaseRun(input) {
    const run: DirectorPhaseRun = {
      id: `run-${input.projectId}`,
      projectId: input.projectId,
      scriptVersionId: `script-${input.projectId}-1`,
      phase: input.phase,
      status: 'pending',
      version: 1,
      taskId: 'task-1',
      outputSummary: null,
      error: null,
      staleAt: null,
      staleReason: null,
      createdAt: '2026-08-10T00:00:00.000Z',
      startedAt: null,
      completedAt: null,
      updatedAt: '2026-08-10T00:00:00.000Z',
    }
    runs.push({ userId: input.userId, run })
    return run
  },
  async getPhaseRun(input) {
    return runs.find(item => item.userId === input.userId && item.run.id === input.runId && item.run.projectId === input.projectId && item.run.phase === input.phase)?.run
  },
  async getPhaseRunForWorker() {
    return undefined
  },
  async markPhaseRunRunning() {
    return undefined
  },
  async setPhaseRunProgress() {
    return undefined
  },
  async completePhaseRun() {
    return undefined
  },
  async failPhaseRun() {
    return undefined
  },
}

const app = createTestApp({
  authService: fakeAuthService,
  directorRepository: fakeDirectorRepository,
}).app

function authed(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      cookie: 'bailian_studio_session=fake-token',
      ...(init.headers ?? {}),
    },
  })
}

describe('director routes', () => {
  beforeEach(() => {
    currentUserId = 'user-1'
    nextProjectId = 1
    projects = []
    runs = []
  })

  it('requires authentication', async () => {
    const response = await app.handle(new Request('http://localhost/api/director/projects'))
    expect(response.status).toBe(401)
  })

  it('creates, lists, reads, and updates a project', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '第一集：雨夜来客',
        storyText: '雨夜里，林默在旧车站等一个不会再来的人。',
        synopsis: '一个关于等待与和解的短剧。',
      }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }

    expect(createResponse.status).toBe(200)
    expect(created.data.project.title).toBe('第一集：雨夜来客')
    expect(created.data.project.phases).toHaveLength(DIRECTOR_PHASES.length)
    const projectId = created.data.project.id

    const listResponse = await app.handle(authed('/api/director/projects'))
    const list = await listResponse.json() as { data: DirectorProjectListResult }
    expect(listResponse.status).toBe(200)
    expect(list.data.items).toHaveLength(1)
    expect(list.data.items[0]?.id).toBe(projectId)

    const updateResponse = await app.handle(authed(`/api/director/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '第一集：雨夜重逢' }),
    }))
    const updated = await updateResponse.json() as { data: { project: DirectorProjectDetail } }
    expect(updateResponse.status).toBe(200)
    expect(updated.data.project.title).toBe('第一集：雨夜重逢')

    const detailResponse = await app.handle(authed(`/api/director/projects/${projectId}`))
    const detail = await detailResponse.json() as { data: { project: DirectorProjectDetail } }
    expect(detailResponse.status).toBe(200)
    expect(detail.data.project.title).toBe('第一集：雨夜重逢')
  })

  it('does not expose another user project', async () => {
    const project = createProject({ title: '私有项目', storyText: '不可见' })
    projects = [{ userId: 'user-2', project }]

    const listResponse = await app.handle(authed('/api/director/projects'))
    const list = await listResponse.json() as { data: DirectorProjectListResult }
    const detailResponse = await app.handle(authed(`/api/director/projects/${project.id}`))

    expect(listResponse.status).toBe(200)
    expect(list.data.items).toHaveLength(0)
    expect(detailResponse.status).toBe(404)
  })

  it('queues and reads a manual phase run', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '分析项目', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }
    const projectId = created.data.project.id

    const runResponse = await app.handle(authed(`/api/director/projects/${projectId}/phases/analyze/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'qwen-plus' }),
    }))
    const runBody = await runResponse.json() as { data: { run: DirectorPhaseRun } }
    expect(runResponse.status).toBe(200)
    expect(runBody.data.run.phase).toBe('analyze')

    const readResponse = await app.handle(authed(`/api/director/projects/${projectId}/phases/analyze/runs/${runBody.data.run.id}`))
    const readBody = await readResponse.json() as { data: { run: DirectorPhaseRun } }
    expect(readResponse.status).toBe(200)
    expect(readBody.data.run.id).toBe(runBody.data.run.id)
  })

  it('rejects a non-reference video model before queueing the video phase', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '视频阶段模型校验', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }

    const runResponse = await app.handle(authed(`/api/director/projects/${created.data.project.id}/phases/videos/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'qwen-plus' }),
    }))
    const body = await runResponse.json() as { error: { code: string } }

    expect(runResponse.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('estimates pending video shots from the selected model manifest', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '视频费用估价', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }
    const projectId = created.data.project.id
    projects[0]!.project = { ...projects[0]!.project, shots: [{ ...createShot(projectId, 'locked'), referenceAssetIds: ['director-ref-1'] }] }

    const estimateResponse = await app.handle(authed(`/api/director/projects/${projectId}/phases/videos/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'wanx-2.7-reference-video' }),
    }))
    const body = await estimateResponse.json() as { data: { estimate: { modelId: string; estimatedCents: number; shotCount: number; currency: string } } }

    expect(estimateResponse.status).toBe(200)
    expect(body.data.estimate.modelId).toBe('wanx-2.7-reference-video')
    expect(body.data.estimate.shotCount).toBe(1)
    expect(body.data.estimate.estimatedCents).toBeGreaterThan(0)
    expect(body.data.estimate.currency).toBe('CNY')
  })

  it('estimates music cost from the selected music manifest before queueing', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '音乐费用估算', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }

    const estimateResponse = await app.handle(authed(`/api/director/projects/${created.data.project.id}/phases/bgm/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'fun-music-v1', prompt: '克制的悬疑钢琴背景音乐', isInstrumental: true, duration: 60 }),
    }))
    const body = await estimateResponse.json() as { data: { estimate: { modelId: string; estimatedCents: number; durationSeconds: number; currency: string } } }

    expect(estimateResponse.status).toBe(200)
    expect(body.data.estimate.modelId).toBe('fun-music-v1')
    expect(body.data.estimate.durationSeconds).toBe(60)
    expect(body.data.estimate.estimatedCents).toBeGreaterThan(0)
    expect(body.data.estimate.currency).toBe('CNY')
  })

  it('estimates and queues a single failed shot retry', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '单镜重试', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }
    const projectId = created.data.project.id
    const shot = { ...createShot(projectId, 'failed'), referenceAssetIds: ['director-ref-1'] }
    projects[0]!.project = { ...projects[0]!.project, shots: [shot] }

    const estimateResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}/video-runs/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'wanx-2.7-reference-video' }),
    }))
    const estimateBody = await estimateResponse.json() as { data: { estimate: { shotCount: number; estimatedCents: number } } }
    expect(estimateResponse.status).toBe(200)
    expect(estimateBody.data.estimate.shotCount).toBe(1)
    expect(estimateBody.data.estimate.estimatedCents).toBeGreaterThan(0)

    const runResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}/video-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'wanx-2.7-reference-video' }),
    }))
    const runBody = await runResponse.json() as { data: { run: DirectorPhaseRun } }
    expect(runResponse.status).toBe(200)
    expect(runBody.data.run.phase).toBe('videos')
  })

  it('binds and detaches a reference asset without changing the project asset source', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '参考资产项目', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }
    const projectId = created.data.project.id

    const attachResponse = await app.handle(authed(`/api/director/projects/${projectId}/assets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetId: 'user-image-1',
        kind: 'character_reference',
        ownerType: 'character',
        ownerId: 'character-1',
      }),
    }))
    const attached = await attachResponse.json() as { data: { asset: DirectorAsset } }
    expect(attachResponse.status).toBe(200)
    expect(attached.data.asset.assetId).toBe('user-image-1')

    const detailResponse = await app.handle(authed(`/api/director/projects/${projectId}`))
    const detail = await detailResponse.json() as { data: { project: DirectorProjectDetail } }
    expect(detail.data.project.assets).toHaveLength(1)

    const detachResponse = await app.handle(authed(`/api/director/projects/${projectId}/assets/${attached.data.asset.id}`, { method: 'DELETE' }))
    expect(detachResponse.status).toBe(200)
    const detached = await detachResponse.json() as { data: { project: DirectorProjectDetail } }
    expect(detached.data.project.assets).toHaveLength(0)
  })

  it('edits, locks, and unlocks a storyboard shot through the review contract', async () => {
    const createResponse = await app.handle(authed('/api/director/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '分镜审核项目', storyText: '故事正文' }),
    }))
    const created = await createResponse.json() as { data: { project: DirectorProjectDetail } }
    const projectId = created.data.project.id
    const shot = createShot(projectId)
    projects[0]!.project = { ...projects[0]!.project, shots: [shot] }

    const editResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ narrative: '修改后的镜头叙事', durationSeconds: 12 }),
    }))
    const edited = await editResponse.json() as { data: { shot: DirectorShot } }
    expect(editResponse.status).toBe(200)
    expect(edited.data.shot.narrative).toBe('修改后的镜头叙事')
    expect(edited.data.shot.status).toBe('needs_review')

    const lockResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'locked' }),
    }))
    expect(lockResponse.status).toBe(200)

    const blockedResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoPrompt: '不应直接覆盖锁定镜头' }),
    }))
    const blocked = await blockedResponse.json() as { error: { code: string } }
    expect(blockedResponse.status).toBe(409)
    expect(blocked.error.code).toBe('DIRECTOR_SHOT_LOCKED')

    const unlockResponse = await app.handle(authed(`/api/director/projects/${projectId}/shots/${shot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'needs_review' }),
    }))
    expect(unlockResponse.status).toBe(200)
  })
})
