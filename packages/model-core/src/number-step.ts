const STEP_TOLERANCE = 1e-9

/**
 * Mirrors the HTML number/range step rule while remaining stable for decimal
 * steps such as 0.1, where direct modulo checks suffer floating-point noise.
 */
export function isNumberStepAligned(value: number, step: number, base = 0): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0 || !Number.isFinite(base)) {
    return false
  }

  const stepsFromBase = (value - base) / step
  return Math.abs(stepsFromBase - Math.round(stepsFromBase)) <= STEP_TOLERANCE
}
