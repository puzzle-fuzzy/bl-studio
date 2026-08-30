import { describe, expect, it, vi } from 'vitest'
import type { DirectorProjectRepositoryDetail, DirectorRepository } from '@bailian-studio/director-repository'
import type { DirectorPhaseRun } from '@bailian-studio/director-contracts'
import { createDirectorApplicationService } from '../src/modules/director/service'

function projectWithShots(shots: Array<Record<string, unknown>>): DirectorProjectRepositoryDetail {
  return { shots } as unknown as DirectorProjectRepositoryDetail
}

const pendingRun = {
  id: 'run-1',
  projectId: 'project-1',
  phase: 'bgm',
  status: 'pending',
} as unknown as DirectorPhaseRun

describe('director application service', () => {
  it('estimates pending video shots from repository state', async () => {
    const getProject = vi.fn().mockResolvedValue(projectWithShots([
      { status: 'locked', durationSeconds: 8, referenceAssetIds: ['reference-1'], videoGenerationId: null },
    ]))
    const repository = { getProject } as unknown as DirectorRepository
    const service = createDirectorApplicationService({ repository })

    const estimate = await service.estimateVideos({
      userId: 'user-1',
      projectId: 'project-1',
      modelId: 'wanx-2.7-reference-video',
    })

    expect(getProject).toHaveBeenCalledWith({ userId: 'user-1', projectId: 'project-1' })
    expect(estimate).toMatchObject({
      modelId: 'wanx-2.7-reference-video',
      shotCount: 1,
      currency: 'CNY',
    })
    expect(estimate.estimatedCents).toBeGreaterThan(0)
  })

  it('blocks assembly run creation when preflight is not ready', async () => {
    const getAssemblyPreflight = vi.fn().mockResolvedValue({
      ready: false,
      issues: [{ code: 'MISSING_VIDEO', message: '缺少视频素材' }],
      plan: null,
    })
    const requestPhaseRun = vi.fn().mockResolvedValue(pendingRun)
    const repository = {
      getAssemblyPreflight,
      requestPhaseRun,
    } as unknown as DirectorRepository
    const service = createDirectorApplicationService({ repository })

    await expect(service.createAssemblyRun({
      userId: 'user-1',
      projectId: 'project-1',
      input: {},
    })).rejects.toMatchObject({ code: 'DIRECTOR_PHASE_INPUT_NOT_READY' })

    expect(requestPhaseRun).not.toHaveBeenCalled()
  })

  it('queues validated phase runs through the repository boundary', async () => {
    const requestPhaseRun = vi.fn().mockResolvedValue(pendingRun)
    const repository = { requestPhaseRun } as unknown as DirectorRepository
    const service = createDirectorApplicationService({ repository })

    await service.createPhaseRun({
      userId: 'user-1',
      projectId: 'project-1',
      phase: 'bgm',
      traceId: 'trace-1',
      input: { modelId: 'fun-music-v1', prompt: '夜雨中的钢琴' },
    })

    expect(requestPhaseRun).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      phase: 'bgm',
      traceId: 'trace-1',
      modelId: 'fun-music-v1',
      prompt: '夜雨中的钢琴',
    })
  })
})
