import { describe, expect, it } from 'vitest'
import { resolveActiveDirectorPhase, type ActiveDirectorPhaseInput } from './director-phase'

function phase(
  name: ActiveDirectorPhaseInput['phase'],
  status: ActiveDirectorPhaseInput['status'],
  activeRunId: string | null = null,
  lastRunId: string | null = null,
): ActiveDirectorPhaseInput {
  return { phase: name, status, activeRunId, lastRunId }
}

describe('resolveActiveDirectorPhase', () => {
  it('returns the first queued or running phase in project order', () => {
    expect(resolveActiveDirectorPhase([
      phase('analyze', 'completed', null, 'run-old'),
      phase('characters', 'queued', 'run-characters'),
      phase('locations', 'running', 'run-locations'),
    ])).toEqual({ phase: 'characters', runId: 'run-characters' })
  })

  it('falls back to the latest run when an active run is missing', () => {
    expect(resolveActiveDirectorPhase([
      phase('storyboard', 'running', null, 'run-storyboard'),
    ])).toEqual({ phase: 'storyboard', runId: 'run-storyboard' })
  })

  it('returns no active phase when all phases are terminal or idle', () => {
    expect(resolveActiveDirectorPhase([
      phase('analyze', 'completed', null, 'run-analyze'),
      phase('videos', 'failed'),
      phase('bgm', 'not_started'),
    ])).toBeUndefined()
  })
})
