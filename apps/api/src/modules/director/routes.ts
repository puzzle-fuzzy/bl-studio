import { Elysia } from 'elysia'
import {
  CreateDirectorProjectSchema,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  validateInput,
} from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'

/**
 * Director project APIs intentionally stop at the project aggregate in this
 * first slice. Phase execution will be added after the worker contract is
 * wired, so the UI never exposes a button that leaves a run stuck in `running`.
 */
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
}
