import { describe, expect, it } from 'vitest'
import {
  applyProviderOutcome,
  DEFAULT_DEGRADATION_CONFIG,
  degradedRemainingMs,
  freshProviderModelHealth,
  isDegraded,
  resolveDegradationConfig,
  type ProviderModelHealth,
} from '../src'

const CONFIG = { failureThreshold: 3, cooldownMs: 60_000 }
const T0 = 1_700_000_000_000

function fail(state: ProviderModelHealth | null, ts: number) {
  return applyProviderOutcome(state, {
    provider: 'dashscope',
    model: 'qwen-image',
    success: false,
    errorMessage: 'upstream unavailable',
    ts,
  }, CONFIG)
}

function succeed(state: ProviderModelHealth | null, ts: number) {
  return applyProviderOutcome(state, {
    provider: 'dashscope',
    model: 'qwen-image',
    success: true,
    ts,
  }, CONFIG)
}

describe('provider health policy', () => {
  it('accumulates failures without degrading before the threshold', () => {
    const result = fail(null, T0)

    expect(result.record.status).toBe('healthy')
    expect(result.record.consecutiveFailures).toBe(1)
    expect(result.record.totalFailures).toBe(1)
    expect(result.record.degradedUntil).toBeNull()
    expect(result.transitionedTo).toBeUndefined()
  })

  it('opens a cooldown window at the threshold and does not extend it during the window', () => {
    let state: ProviderModelHealth | null = null
    state = fail(state, T0).record
    state = fail(state, T0 + 1).record
    const opened = fail(state, T0 + 2)
    const firstWindow = opened.record.degradedUntil

    expect(opened.record.status).toBe('degraded')
    expect(firstWindow).toBe(T0 + 2 + CONFIG.cooldownMs)
    expect(opened.transitionedTo).toBe('degraded')

    const repeated = fail(opened.record, T0 + 10)
    expect(repeated.record.degradedUntil).toBe(firstWindow)
    expect(repeated.transitionedTo).toBeUndefined()
    expect(repeated.record.consecutiveFailures).toBe(4)
  })

  it('uses the first call after cooldown as a half-open probe', () => {
    let state: ProviderModelHealth | null = null
    for (let index = 0; index < 3; index += 1)
      state = fail(state, T0 + index).record

    const probeAt = state!.degradedUntil! + 1
    const recovered = succeed(state, probeAt)

    expect(recovered.record.status).toBe('healthy')
    expect(recovered.record.consecutiveFailures).toBe(0)
    expect(recovered.record.totalSuccesses).toBe(1)
    expect(recovered.record.degradedUntil).toBeNull()
    expect(recovered.transitionedTo).toBe('healthy')
  })

  it('reopens a fresh cooldown when the half-open probe fails', () => {
    let state: ProviderModelHealth | null = null
    for (let index = 0; index < 3; index += 1)
      state = fail(state, T0 + index).record

    const probeAt = state!.degradedUntil! + 1
    const reopened = fail(state, probeAt)

    expect(reopened.record.status).toBe('degraded')
    expect(reopened.record.consecutiveFailures).toBe(4)
    expect(reopened.record.degradedUntil).toBe(probeAt + CONFIG.cooldownMs)
    expect(reopened.transitionedTo).toBe('degraded')
  })

  it('keeps provider and model identity in the pure record', () => {
    const record = freshProviderModelHealth('dashscope', 'qwen-image', T0)
    expect(record).toMatchObject({ provider: 'dashscope', model: 'qwen-image', status: 'healthy' })
  })
})

describe('provider health helpers', () => {
  it('blocks only while the cooldown is active', () => {
    const { record } = applyProviderOutcome(null, {
      provider: 'dashscope',
      model: 'qwen-image',
      success: false,
      ts: T0,
    }, { failureThreshold: 1, cooldownMs: 10_000 })

    expect(isDegraded(record, T0)).toBe(true)
    expect(isDegraded(record, T0 + 10_000)).toBe(false)
    expect(degradedRemainingMs(record, T0 + 4_000)).toBe(6_000)
    expect(degradedRemainingMs(record, T0 + 10_000)).toBe(0)
  })

  it('falls back to safe positive defaults for invalid environment values', () => {
    expect(resolveDegradationConfig({})).toEqual(DEFAULT_DEGRADATION_CONFIG)
    expect(resolveDegradationConfig({
      PROVIDER_DEGRADATION_FAILURE_THRESHOLD: '5',
      PROVIDER_DEGRADATION_COOLDOWN_MS: '120000',
    })).toEqual({ failureThreshold: 5, cooldownMs: 120_000 })
    expect(resolveDegradationConfig({
      PROVIDER_DEGRADATION_FAILURE_THRESHOLD: '0',
      PROVIDER_DEGRADATION_COOLDOWN_MS: '-1',
    })).toEqual(DEFAULT_DEGRADATION_CONFIG)
  })
})
