export function createMediaJobId(): string {
  return `media_job_${crypto.randomUUID()}`
}

export function createMediaAssetId(): string {
  return `asset_${crypto.randomUUID()}`
}

/** Stable output identity for a media job; retries must not create duplicate assets. */
export function createMediaOutputAssetId(jobId: string, outputKind: string): string {
  return `asset_${jobId}_${outputKind}`
}

export function createMediaTaskId(): string {
  return `task_${crypto.randomUUID()}`
}
