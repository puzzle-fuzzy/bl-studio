/**
 * Compare manifest values used by select options and visibility rules.
 *
 * Some provider parameters are structured values, for example Fun-ASR's
 * channel list `[0]`. UI transports and default values do not necessarily
 * preserve object identity, so strict equality alone would reject an otherwise
 * valid configured option.
 */
export function modelValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}
