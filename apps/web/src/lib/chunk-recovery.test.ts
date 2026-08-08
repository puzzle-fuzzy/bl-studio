import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, notifyChunkLoadFailure } from './chunk-recovery'

describe('chunk recovery', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('recognizes module/chunk loading failures but not API errors', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/page.js'))).toBe(true)
    expect(isChunkLoadError(new Error('GET /api/models failed with 503'))).toBe(false)
  })

  it('uses sessionStorage as a one-reload guard', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    notifyChunkLoadFailure(new Error('Loading chunk 42 failed'))
    notifyChunkLoadFailure(new Error('Loading chunk 43 failed'))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('app:chunk-reload-attempted')).toBe('1')
    reload.mockRestore()
  })
})
