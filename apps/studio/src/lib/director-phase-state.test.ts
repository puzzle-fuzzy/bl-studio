import { describe, expect, it } from 'vitest'
import { markDirectorPhaseQueued } from './director-phase-state'

function phaseState(phase: 'analyze' | 'characters' | 'videos', status: 'not_started' | 'failed' = 'not_started') {
  return {
    phase,
    status,
    version: 2,
    activeRunId: null,
    lastRunId: status === 'failed' ? 'run-old' : null,
    lastError: status === 'failed' ? { code: 'FAILED', message: 'old error' } : null,
    updatedAt: '2026-08-31T00:00:00.000Z',
  } as const
}

describe('markDirectorPhaseQueued', () => {
  it('updates only the requested phase and clears its previous error', () => {
    const phases = [phaseState('analyze'), phaseState('characters', 'failed'), phaseState('videos')]
    const next = markDirectorPhaseQueued(phases, 'characters', { id: 'run-new', version: 3 })

    expect(next).toEqual([
      phases[0],
      { ...phases[1], status: 'queued', activeRunId: 'run-new', version: 3, lastError: null },
      phases[2],
    ])
  })

  it('leaves the phase list unchanged when the phase is absent', () => {
    const phases = [phaseState('analyze')]
    expect(markDirectorPhaseQueued(phases, 'videos', { id: 'run-new', version: 3 })).toEqual(phases)
  })
})
