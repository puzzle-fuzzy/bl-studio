import { afterEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, notifyChunkLoadFailure } from './chunk-recovery'

describe('chunk-recovery', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('detects dynamic-import / preload chunk load failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: http://x/Detail-abc.js'))).toBe(true)
    expect(isChunkLoadError('Loading chunk 123 failed.')).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError('Unable to preload module script')).toBe(true)
  })

  it('ignores API and network failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch /api/generations: 500'))).toBe(false)
    expect(isChunkLoadError('network error')).toBe(false)
  })

  it('reloads once on chunk failure and suppresses a second reload in the same session', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    notifyChunkLoadFailure(new Error('Failed to fetch dynamically imported module: x'))
    notifyChunkLoadFailure(new Error('Failed to fetch dynamically imported module: y'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload for non-chunk failures', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    notifyChunkLoadFailure(new Error('boom'))
    expect(reload).not.toHaveBeenCalled()
  })
})
