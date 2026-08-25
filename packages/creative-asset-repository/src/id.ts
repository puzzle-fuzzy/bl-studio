import { randomUUID } from 'node:crypto'

export function nextCreativeProjectId(): string {
  return `creative-project_${randomUUID()}`
}

export function nextCreativeProjectAssetId(): string {
  return `creative-project-asset_${randomUUID()}`
}

export function nextCreativeAssetId(): string {
  return `creative-asset_${randomUUID()}`
}

export function nextCreativeAssetVersionId(): string {
  return `creative-asset-version_${randomUUID()}`
}

export function nextCreativeAssetReferenceId(): string {
  return `creative-asset-reference_${randomUUID()}`
}
