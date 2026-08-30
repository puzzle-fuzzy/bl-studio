import { Elysia } from 'elysia'
import { requestErrorResponseBody } from '../../lib/http-errors'
import type { ApiDependencies } from '../../dependencies'

export function createModelRoutes(deps: Pick<ApiDependencies, 'modelCatalog'>) {
  return new Elysia({ prefix: '/api/models' })
  .get('/catalog', () => ({
    success: true,
    data: {
      items: deps.modelCatalog.list(),
    },
  }))
  .get('/:id', ({ request, params, set }) => {
    const model = deps.modelCatalog.getById(params.id)
    if (!model) {
      set.status = 404
      return requestErrorResponseBody(request, 'MODEL_NOT_FOUND', 'Model not found', set)
    }

    return {
      success: true,
      data: model,
    }
  })
}
