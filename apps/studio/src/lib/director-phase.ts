import type { DirectorProjectDetail } from '@bailian-studio/api-client'

type DirectorPhaseState = DirectorProjectDetail['phases'][number]

export type ActiveDirectorPhaseInput = Pick<DirectorPhaseState, 'phase' | 'status' | 'activeRunId' | 'lastRunId'>

export interface ActiveDirectorPhase {
  phase: DirectorPhaseState['phase']
  runId: string | undefined
}

/** 按项目阶段顺序定位当前执行中的阶段，并优先使用活动 run。 */
export function resolveActiveDirectorPhase(
  phases: readonly ActiveDirectorPhaseInput[],
): ActiveDirectorPhase | undefined {
  const state = phases.find(phase => phase.status === 'queued' || phase.status === 'running')
  if (state === undefined) return undefined
  return {
    phase: state.phase,
    runId: state.activeRunId ?? state.lastRunId ?? undefined,
  }
}
