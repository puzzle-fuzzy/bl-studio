import type { DirectorPhaseRun, DirectorProjectDetail } from '@bailian-studio/api-client'

type DirectorPhaseState = DirectorProjectDetail['phases'][number]

/** 将指定阶段切换为排队状态，并绑定本次执行的版本与 run。 */
export function markDirectorPhaseQueued(
  phases: readonly DirectorPhaseState[],
  phase: DirectorPhaseState['phase'],
  run: Pick<DirectorPhaseRun, 'id' | 'version'>,
): DirectorPhaseState[] {
  return phases.map(state => state.phase === phase
    ? { ...state, status: 'queued', activeRunId: run.id, version: run.version, lastError: null }
    : state)
}
