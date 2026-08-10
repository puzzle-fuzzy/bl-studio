export type DirectorRepositoryErrorCode =
  | 'DIRECTOR_PROJECT_NOT_FOUND'
  | 'DIRECTOR_PHASE_NOT_FOUND'
  | 'DIRECTOR_PHASE_NOT_READY'
  | 'DIRECTOR_PHASE_ALREADY_RUNNING'
  | 'DIRECTOR_PHASE_RUN_NOT_FOUND'
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
