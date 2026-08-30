export interface CreativeAssetMembershipDiff {
  attachProjectIds: string[]
  detachProjectIds: string[]
}

export function diffCreativeAssetMemberships(currentProjectIds: readonly string[], nextProjectIds: readonly string[]): CreativeAssetMembershipDiff {
  const current = new Set(currentProjectIds)
  const next = [...new Set(nextProjectIds)]
  const nextSet = new Set(next)
  return {
    attachProjectIds: next.filter(projectId => !current.has(projectId)),
    detachProjectIds: [...current].filter(projectId => !nextSet.has(projectId)),
  }
}
