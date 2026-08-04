import type { ModelParameter, ParameterVisibilityRule } from './types'
import { modelValuesEqual } from './value-equality'

/** Whether a parameter is active for the current input values. */
export function isModelParameterVisible(
  parameter: Pick<ModelParameter, 'visibleWhen'>,
  values: Record<string, unknown>,
): boolean {
  const rule = parameter.visibleWhen
  return rule === undefined || valuesMatchRule(rule, values)
}

function valuesMatchRule(rule: ParameterVisibilityRule, values: Record<string, unknown>): boolean {
  return modelValuesEqual(values[rule.field], rule.equals)
}
