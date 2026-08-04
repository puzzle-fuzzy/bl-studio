export const DEFAULT_MAX_ARTIFACT_READ_BYTES = 100 * 1024 * 1024

export interface ArtifactConfig {
  readonly maxReadBytes: number
}

/** Read the API-side guardrail for local artifact responses once at startup. */
export function readArtifactConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): ArtifactConfig {
  const configured = source['ARTIFACT_MAX_READ_BYTES']?.trim()
  if (configured === undefined || configured.length === 0) {
    return Object.freeze({ maxReadBytes: DEFAULT_MAX_ARTIFACT_READ_BYTES })
  }

  const parsed = Number(configured)
  return Object.freeze({
    maxReadBytes: Number.isSafeInteger(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MAX_ARTIFACT_READ_BYTES,
  })
}
