export function createMediaJobId(): string {
  return `media_job_${crypto.randomUUID()}`
}

export function createMediaAssetId(): string {
  return `asset_${crypto.randomUUID()}`
}

/** 媒体任务的稳定输出标识；重试不得产生重复资产。 */
export function createMediaOutputAssetId(jobId: string, outputKind: string): string {
  return `asset_${jobId}_${outputKind}`
}

export function createMediaTaskId(): string {
  return `task_${crypto.randomUUID()}`
}
