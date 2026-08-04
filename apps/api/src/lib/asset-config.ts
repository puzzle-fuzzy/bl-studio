export const DEFAULT_MAX_ASSET_SIZE_BYTES = 100 * 1024 * 1024
export const DEFAULT_MAX_MEDIA_DURATION_SECONDS = 30 * 60

export interface AssetConfig {
  readonly maxAssetSizeBytes: number
  readonly maxMediaDurationSeconds?: number
  readonly ffprobePath: string
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

/** Parse upload/probe limits once at the API composition root. */
export function readAssetConfig(source: EnvironmentSource = process.env): AssetConfig {
  const maxAssetSizeBytes = positiveNumberOrDefault(source['ASSET_MAX_SIZE_BYTES'], DEFAULT_MAX_ASSET_SIZE_BYTES)
  const maxDuration = nonNegativeNumberOrDefault(source['MEDIA_MAX_DURATION_SECONDS'], DEFAULT_MAX_MEDIA_DURATION_SECONDS)

  return Object.freeze({
    maxAssetSizeBytes,
    ...(maxDuration === 0 ? {} : { maxMediaDurationSeconds: maxDuration }),
    ffprobePath: source['FFPROBE_PATH']?.trim() || 'ffprobe',
  })
}

function positiveNumberOrDefault(value: string | undefined, fallback: number): number {
  if (value?.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumberOrDefault(value: string | undefined, fallback: number): number {
  if (value?.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
