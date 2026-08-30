import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePreferredModel, type ModelOption } from './use-preferred-model'

const models: readonly ModelOption[] = [{ id: 'first' }, { id: 'preferred' }]

function useTestModel(modelList: readonly ModelOption[], preferredId?: string) {
  const [modelId, setModelId] = useState('')
  usePreferredModel(modelId, modelList, setModelId, preferredId)
  return { modelId, setModelId }
}

describe('usePreferredModel', () => {
  it('selects the preferred model when it is available', () => {
    const { result, rerender } = renderHook(
      ({ modelList, preferredId }) => useTestModel(modelList, preferredId),
      { initialProps: { modelList: models, preferredId: 'preferred' } },
    )

    expect(result.current.modelId).toBe('preferred')
    act(() => result.current.setModelId('removed'))
    rerender({ modelList: models, preferredId: 'preferred' })
    expect(result.current.modelId).toBe('preferred')
  })

  it('falls back to the first model when the preferred model is unavailable', () => {
    const { result } = renderHook(
      ({ modelList, preferredId }) => useTestModel(modelList, preferredId),
      { initialProps: { modelList: models, preferredId: 'missing' } },
    )

    expect(result.current.modelId).toBe('first')
  })

  it('preserves a valid user selection when the model list changes', () => {
    const { result, rerender } = renderHook(
      ({ modelList }) => useTestModel(modelList, 'preferred'),
      { initialProps: { modelList: models } },
    )

    act(() => result.current.setModelId('first'))
    rerender({ modelList: [...models, { id: 'new' }] })
    expect(result.current.modelId).toBe('first')
  })
})
