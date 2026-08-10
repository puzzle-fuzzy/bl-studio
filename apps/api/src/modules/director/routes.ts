import { Elysia } from 'elysia'
import {
  AttachDirectorAssetSchema,
  CreateDirectorPhaseRunSchema,
  DirectorPhaseSchema,
  CreateDirectorProjectSchema,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  validateInput,
} from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'

export function createDirectorRoutes(deps: ApiDependencies) {
  const repository = deps.directorRepository

  return new Elysia({ prefix: '/api/director' })
    .get('/projects', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListDirectorProjectsSchema, query)
      const result = await repository.listProjects({ userId: user.id, ...input })
      return { success: true, data: result }
    })
    .post('/projects', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorProjectSchema, body)
      const project = await repository.createProject({ userId: user.id, ...input })
      return { success: true, data: { project } }
    })
    .get('/projects/:id', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      return { success: true, data: { project } }
    })
    .patch('/projects/:id', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const patch = validateInput(UpdateDirectorProjectSchema, body)
      const project = await repository.updateProject({ userId: user.id, projectId: params.id, patch })
      return { success: true, data: { project } }
    })
    .post('/projects/:id/assets', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(AttachDirectorAssetSchema, body)
      const asset = await repository.attachAsset({ userId: user.id, projectId: params.id, ...input })
      return { success: true, data: { asset } }
    })
    .delete('/projects/:id/assets/:assetId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const project = await repository.detachAsset({
        userId: user.id,
        projectId: params.id,
        directorAssetId: params.assetId,
      })
      return { success: true, data: { project } }
    })
    .post('/projects/:id/phases/:phase/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const run = await repository.requestPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase,
        ...input,
      })
      return { success: true, data: { run } }
    })
    .get('/projects/:id/phases/:phase/runs/:runId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const run = await repository.getPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase,
        runId: params.runId,
      })
      if (run === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PHASE_RUN_NOT_FOUND', `Director phase run not found: ${params.runId}`)
      }
      return { success: true, data: { run } }
    })
}
