const STEP_TOLERANCE = 1e-9

/**
 * 对齐 HTML number/range 的 step 规则，同时对小数字长（如 0.1）保持稳定——
 * 直接取模校验在小数步长下会受浮点噪声影响。
 */
export function isNumberStepAligned(value: number, step: number, base = 0): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0 || !Number.isFinite(base)) {
    return false
  }

  const stepsFromBase = (value - base) / step
  return Math.abs(stepsFromBase - Math.round(stepsFromBase)) <= STEP_TOLERANCE
}
