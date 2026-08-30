/**
 * Director domain contracts shared by the API, worker, repository, and
 * typed API client. This package owns the director wire shapes and the pure
 * assembly preflight rules; it must not depend on runtime, persistence, or UI.
 */

export * from './director'
export * from './director-assembly'
