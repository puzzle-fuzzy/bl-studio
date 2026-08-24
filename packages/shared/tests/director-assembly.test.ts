import { describe, expect, it } from 'vitest'
import { buildDirectorAssemblyPreflightFromCandidates } from '../src/director-assembly'

const shot = (overrides: Partial<{
  id: string
  sequence: number
  version: number
  status: string
  activeVideoAssetId: string | null
  durationSeconds: number | null
  staleAt: string | null
}> = {}) => ({
  id: 'shot-1',
  sequence: 1,
  version: 2,
  status: 'succeeded',
  activeVideoAssetId: 'director-video-1',
  durationSeconds: 5,
  staleAt: null,
  ...overrides,
})

describe('director assembly preflight', () => {
  it('creates a sequence-ordered immutable plan from active shot videos', () => {
    const result = buildDirectorAssemblyPreflightFromCandidates(
      [shot({ id: 'shot-2', sequence: 2, activeVideoAssetId: 'director-video-2', durationSeconds: 3 }), shot()],
      [
        { id: 'director-video-1', kind: 'shot_video', assetId: 'asset-video-1', sourceRunId: 'run-video-1', staleAt: null },
        { id: 'director-video-2', kind: 'shot_video', assetId: 'asset-video-2', sourceRunId: 'run-video-2', staleAt: null },
        { id: 'director-music-1', kind: 'music', assetId: 'asset-music-1', sourceRunId: 'run-music-1', staleAt: null },
      ],
      { fps: 24 },
    )

    expect(result.ready).toBe(true)
    expect(result.plan.shots.map(item => item.shotId)).toEqual(['shot-1', 'shot-2'])
    expect(result.plan.totalDurationSeconds).toBe(8)
    expect(result.plan.settings.fps).toBe(24)
    expect(result.plan.music?.assetId).toBe('asset-music-1')
    expect(result.plan.shots[0]?.sourceRunId).toBe('run-video-1')
  })

  it('blocks stale or incomplete shots while keeping valid assets in the diagnostics', () => {
    const result = buildDirectorAssemblyPreflightFromCandidates(
      [shot({ status: 'failed' }), shot({ id: 'shot-2', sequence: 2, staleAt: '2026-08-11T00:00:00.000Z' })],
      [{ id: 'director-video-1', kind: 'shot_video', assetId: 'asset-video-1', sourceRunId: 'run-video-1', staleAt: null }],
    )

    expect(result.ready).toBe(false)
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['SHOT_VIDEO_MISSING', 'SHOT_STALE', 'SHOTS_EMPTY']))
    expect(result.warnings).toHaveLength(1)
  })
})
