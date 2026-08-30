import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, directorPhaseRuns, directorPhaseStates, users } from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { and, eq } from 'drizzle-orm'
import { createTaskQueueTransactionStore } from '@bailian-studio/task-repository'
import { createDirectorRepository } from '../src/repository'

const now = new Date('2026-08-30T00:00:00.000Z')
const ownerId = 'director-owner'
const otherUserId = 'director-other'

let isolated!: Awaited<ReturnType<typeof createIsolatedTestDb>>
let db!: ReturnType<typeof createDb>
let repository!: ReturnType<typeof createDirectorRepository>

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

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
  repository = createDirectorRepository({ db, taskQueueTransactionStore: createTaskQueueTransactionStore() })
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

describe('director entity candidate promotion', () => {
  it('promotes accepted characters and scenes atomically, leaves props as candidates, and is idempotent', async () => {
    const project = await repository.createProject({
      userId: ownerId,
      title: '候选提升测试',
      storyText: '林默走进旧车站，手里握着一把旧钥匙。',
    })
    const [character, scene, prop] = await repository.createEntityCandidates({
      userId: ownerId,
      projectId: project.id,
      candidates: [
        {
          kind: 'character',
          name: '林默',
          description: '沉默的等待者',
          traits: ['克制'],
          mentions: [{ text: '林默', start: 0, end: 2 }],
        },
        {
          kind: 'scene',
          name: '旧车站',
          description: '夜里的旧车站',
          traits: ['空旷'],
          mentions: [{ text: '旧车站', start: 5, end: 8 }],
        },
        {
          kind: 'prop',
          name: '旧钥匙',
          description: '一把旧钥匙',
          traits: ['磨损'],
          mentions: [{ text: '旧钥匙', start: 13, end: 16 }],
        },
      ],
    })

    if (character === undefined || scene === undefined || prop === undefined) {
      throw new Error('expected three entity candidates')
    }

    expect(await repository.listEntityCandidates({ userId: otherUserId, projectId: project.id })).toEqual([])
    expect(await repository.reviewEntityCandidate({ userId: otherUserId, candidateId: character.id, status: 'accepted' })).toBeUndefined()

    const acceptedCharacter = await repository.reviewEntityCandidate({ userId: ownerId, candidateId: character.id, status: 'accepted' })
    const acceptedScene = await repository.reviewEntityCandidate({ userId: ownerId, candidateId: scene.id, status: 'accepted' })
    const acceptedProp = await repository.reviewEntityCandidate({ userId: ownerId, candidateId: prop.id, status: 'accepted' })

    expect(acceptedCharacter?.status).toBe('accepted')
    expect(acceptedScene?.status).toBe('accepted')
    expect(acceptedProp?.status).toBe('accepted')

    await repository.reviewEntityCandidate({ userId: ownerId, candidateId: character.id, status: 'accepted' })
    await repository.reviewEntityCandidate({ userId: ownerId, candidateId: scene.id, status: 'accepted' })

    const detail = await repository.getProject({ userId: ownerId, projectId: project.id })
    expect(detail?.characters).toHaveLength(1)
    expect(detail?.characters[0]?.name).toBe('林默')
    expect(detail?.characters[0]?.metadata.entityCandidateId).toBe(character.id)
    expect(detail?.locations).toHaveLength(1)
    expect(detail?.locations[0]?.name).toBe('旧车站')
    expect(detail?.locations[0]?.metadata.entityCandidateId).toBe(scene.id)
  })

  it('freezes active director entities into a storyboard run snapshot', async () => {
    const project = await repository.createProject({
      userId: ownerId,
      title: '分镜实体快照测试',
      storyText: '林默在旧车站等待。',
    })
    const [character, scene] = await repository.createEntityCandidates({
      userId: ownerId,
      projectId: project.id,
      candidates: [
        {
          kind: 'character',
          name: '林默',
          description: '等待者',
          traits: ['克制'],
          mentions: [{ text: '林默', start: 0, end: 2 }],
        },
        {
          kind: 'scene',
          name: '旧车站',
          description: '空旷车站',
          traits: ['夜色'],
          mentions: [{ text: '旧车站', start: 3, end: 6 }],
        },
      ],
    })
    if (character === undefined || scene === undefined) throw new Error('expected two entity candidates')
    await repository.reviewEntityCandidate({ userId: ownerId, candidateId: character.id, status: 'accepted' })
    await repository.reviewEntityCandidate({ userId: ownerId, candidateId: scene.id, status: 'accepted' })

    const current = await repository.getProject({ userId: ownerId, projectId: project.id })
    if (current === undefined) throw new Error('expected project')
    const phaseNow = new Date('2026-08-30T00:00:00.000Z')
    await db.insert(directorPhaseRuns).values([
      {
        id: 'source-analysis',
        projectId: project.id,
        scriptVersionId: current.scriptVersion.id,
        phase: 'analyze',
        status: 'succeeded',
        version: 1,
        inputSnapshotJson: {},
        outputSummaryJson: { analysis: {} },
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: phaseNow,
        updatedAt: phaseNow,
      },
      {
        id: 'source-characters',
        projectId: project.id,
        scriptVersionId: current.scriptVersion.id,
        phase: 'characters',
        status: 'succeeded',
        version: 1,
        inputSnapshotJson: {},
        outputSummaryJson: { characters: {} },
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: phaseNow,
        updatedAt: phaseNow,
      },
      {
        id: 'source-locations',
        projectId: project.id,
        scriptVersionId: current.scriptVersion.id,
        phase: 'locations',
        status: 'succeeded',
        version: 1,
        inputSnapshotJson: {},
        outputSummaryJson: { locations: {} },
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: phaseNow,
        updatedAt: phaseNow,
      },
    ])
    await db
      .update(directorPhaseStates)
      .set({ status: 'ready', updatedAt: phaseNow, updatedBy: ownerId })
      .where(and(eq(directorPhaseStates.projectId, project.id), eq(directorPhaseStates.phase, 'storyboard')))

    const run = await repository.requestPhaseRun({
      userId: ownerId,
      projectId: project.id,
      phase: 'storyboard',
      modelId: 'qwen-plus',
    })
    const workerRun = await repository.getPhaseRunForWorker(run.id)
    const entities = workerRun?.inputSnapshot.directorEntities as { characters?: Array<{ name?: string; metadata?: { entityCandidateId?: string } }>; locations?: Array<{ name?: string; metadata?: { entityCandidateId?: string } }> } | undefined
    expect(entities?.characters?.map(entity => entity.name)).toContain('林默')
    expect(entities?.characters?.[0]?.metadata?.entityCandidateId).toBe(character.id)
    expect(entities?.locations?.map(entity => entity.name)).toContain('旧车站')
    expect(entities?.locations?.[0]?.metadata?.entityCandidateId).toBe(scene.id)
  })
})
