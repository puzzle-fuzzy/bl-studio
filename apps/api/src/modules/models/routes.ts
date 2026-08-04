import { Elysia } from 'elysia'
import {
  getModelCatalogItemById,
  listModelCatalogItems,
} from '@bailian-studio/model-core'
import {
  getBailianContractSnapshot,
} from '@bailian-studio/bailian-adapter'
import { requestErrorResponseBody } from '../../lib/http-errors'

export const modelRoutes = new Elysia({ prefix: '/api/models' })
  .get('/catalog', () => ({
    success: true,
    data: {
      items: listModelCatalogItems(),
    },
  }))
  .get('/bailian-contract', () => ({
    success: true,
    data: getBailianContractSnapshot(),
  }))
  .get('/:id', ({ request, params, set }) => {
    const model = getModelCatalogItemById(params.id)
    if (!model) {
      set.status = 404
      return requestErrorResponseBody(request, 'MODEL_NOT_FOUND', 'Model not found', set)
    }

    return {
      success: true,
      data: model,
    }
  })
