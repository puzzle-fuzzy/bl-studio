export type DirectorRepositoryErrorCode =
  | 'DIRECTOR_PROJECT_NOT_FOUND'
  | 'DIRECTOR_PHASE_NOT_FOUND'
  | 'DIRECTOR_PHASE_NOT_READY'
  | 'DIRECTOR_PHASE_INPUT_NOT_READY'
  | 'DIRECTOR_PHASE_ALREADY_RUNNING'
  | 'DIRECTOR_PROJECT_ACTIVE_RUN'
  | 'DIRECTOR_PHASE_RUN_NOT_FOUND'
  | 'DIRECTOR_ASSET_NOT_FOUND'
  | 'DIRECTOR_ASSET_KIND_NOT_SUPPORTED'
  | 'DIRECTOR_ASSET_OWNER_INVALID'
  | 'DIRECTOR_ASSET_OWNER_NOT_FOUND'
  | 'DIRECTOR_ASSET_ALREADY_ATTACHED'
  | 'DIRECTOR_SHOT_NOT_FOUND'
  | 'DIRECTOR_SHOT_LOCKED'
  | 'DIRECTOR_INVALID_CURSOR'
  | 'DIRECTOR_DATABASE_ERROR'

export class DirectorRepositoryError extends Error {
  readonly code: DirectorRepositoryErrorCode
  readonly details?: unknown

  constructor(code: DirectorRepositoryErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DirectorRepositoryError'
    this.code = code
    this.details = details
  }
}
