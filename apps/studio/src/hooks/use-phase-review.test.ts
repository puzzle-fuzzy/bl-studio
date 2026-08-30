import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePhaseReview } from './use-phase-review'

interface TestResult {
  summary: string
}

describe('usePhaseReview', () => {
  it('starts with an empty editable phase state', () => {
    const { result } = renderHook(() => usePhaseReview<TestResult>())

    expect(result.current.modelId).toBe('')
    expect(result.current.text).toBeUndefined()
    expect(result.current.result).toBeUndefined()
    expect(result.current.stale).toBe(false)
  })

  it('updates each phase field independently and supports clearing optional values', () => {
    const { result } = renderHook(() => usePhaseReview<TestResult>())

    act(() => {
      result.current.setModelId('qwen-plus')
      result.current.setText('updated screenplay')
      result.current.setResult({ summary: 'ready' })
      result.current.setStale(true)
    })

    expect(result.current).toMatchObject({
      modelId: 'qwen-plus',
      text: 'updated screenplay',
      result: { summary: 'ready' },
      stale: true,
    })

    act(() => {
      result.current.setText(undefined)
      result.current.setResult(undefined)
      result.current.setStale(false)
    })

    expect(result.current.text).toBeUndefined()
    expect(result.current.result).toBeUndefined()
    expect(result.current.stale).toBe(false)
    expect(result.current.modelId).toBe('qwen-plus')
  })
})
