import { describe, expect, it } from 'vitest'
import {
  assetDerivatives,
  authActionTokens,
  createDb,
  creditAccounts,
  creditLedgerEntries,
  creativeAssetPacks,
  creativeAssets,
  creativeAssetReferences,
  creativeAssetVersions,
  creativeGenerationContexts,
  creativeGenerationContextAssets,
  creativeGenerationContextReferences,
  generationArtifacts,
  generationInputAssets,
  generationRecords,
  generationShares,
  providerRequestAudits,
  taskRecords,
  usageRecords,
  userAssets,
  users,
} from '../src'

interface IndexConfigProbe {
  config: {
    name?: string
    unique: boolean
    where?: unknown
  }
}

describe('db schema exports', () => {
  it('exports role and credit ledger tables', () => {
    expect(users.role).toBeDefined()
    expect(users.emailVerifiedAt).toBeDefined()
    expect(authActionTokens.userId).toBeDefined()
    expect(authActionTokens.purpose).toBeDefined()
    expect(authActionTokens.tokenHash).toBeDefined()
    expect(authActionTokens.expiresAt).toBeDefined()
    expect(authActionTokens.consumedAt).toBeDefined()
    expect(creditAccounts.userId).toBeDefined()
    expect(creditAccounts.availableCents).toBeDefined()
    expect(creditAccounts.reservedCents).toBeDefined()
    expect(creditLedgerEntries.kind).toBeDefined()
    expect(creditLedgerEntries.idempotencyKey).toBeDefined()
  })

  it('exports generation and task tables', () => {
    expect(generationRecords).toBeDefined()
    expect(generationRecords.currency).toBeDefined()
    expect(generationRecords.pricingVersion).toBeDefined()
    expect(generationRecords.modelManifestHash).toBeDefined()
    expect(taskRecords).toBeDefined()
  })

  it('exports provider request audits with stable tracing and cost fields', () => {
    expect(providerRequestAudits).toBeDefined()
    expect(providerRequestAudits.generationId).toBeDefined()
    expect(providerRequestAudits.taskId).toBeDefined()
    expect(providerRequestAudits.providerRequestId).toBeDefined()
    expect(providerRequestAudits.estimatedCostCents).toBeDefined()
    expect(providerRequestAudits.billedCostCents).toBeDefined()
    expect(providerRequestAudits.errorJson).toBeDefined()
  })

  it('exports one-generation-one-usage ledger fields', () => {
    expect(usageRecords).toBeDefined()
    expect(usageRecords.generationId).toBeDefined()
    expect(usageRecords.estimatedCostCents).toBeDefined()
    expect(usageRecords.providerCostCents).toBeDefined()
    expect(usageRecords.chargedCostCents).toBeDefined()
    expect(usageRecords.status).toBeDefined()
  })

  it('exports generation artifacts with storage status fields', () => {
    expect(generationArtifacts).toBeDefined()
    expect(generationArtifacts.recordId).toBeDefined()
    expect(generationArtifacts.status).toBeDefined()
    expect(generationArtifacts.storageKey).toBeDefined()
  })

  it('exports stable generation input assets and explicit generated-asset relationships', () => {
    expect(generationInputAssets.generationId).toBeDefined()
    expect(generationInputAssets.parameterName).toBeDefined()
    expect(generationInputAssets.assetId).toBeDefined()
    expect(userAssets.generationArtifactId).toBeDefined()
    expect(userAssets.recordId).toBeDefined()
    expect(userAssets.modelId).toBeDefined()

    const tableInternals = generationInputAssets as unknown as Record<symbol, unknown>
    const extraConfigBuilder = tableInternals[Symbol.for('drizzle:ExtraConfigBuilder')]
    const extraConfigColumns = tableInternals[Symbol.for('drizzle:ExtraConfigColumns')]
    if (typeof extraConfigBuilder !== 'function') {
      throw new Error('expected generation_input_assets extra config builder')
    }

    const indexes = extraConfigBuilder(extraConfigColumns) as IndexConfigProbe[]
    const parameterIndex = indexes.find(index =>
      'config' in index && index.config.name === 'generation_input_assets_parameter_idx'
    )
    expect(parameterIndex?.config.unique).toBe(true)
  })

  it('exports typed creative asset tables and preserves canonical-version uniqueness', () => {
    expect(creativeAssetPacks.title).toBeDefined()
    expect(creativeAssets.type).toBeDefined()
    expect(creativeAssets.packId).toBeDefined()
    expect(creativeAssetVersions.semanticSpecJson).toBeDefined()
    expect(creativeAssetReferences.role).toBeDefined()
    expect(creativeGenerationContexts.protocolVersion).toBeDefined()
    expect(creativeGenerationContexts.fingerprint).toBeDefined()
    expect(creativeGenerationContextAssets.assetVersionId).toBeDefined()
    expect(creativeGenerationContextReferences.referenceId).toBeDefined()

    const tableInternals = creativeAssetVersions as unknown as Record<symbol, unknown>
    const extraConfigBuilder = tableInternals[Symbol.for('drizzle:ExtraConfigBuilder')]
    const extraConfigColumns = tableInternals[Symbol.for('drizzle:ExtraConfigColumns')]
    if (typeof extraConfigBuilder !== 'function') {
      throw new Error('expected creative_asset_versions extra config builder')
    }

    const indexes = extraConfigBuilder(extraConfigColumns) as IndexConfigProbe[]
    const approvedIndex = indexes.find(index =>
      'config' in index && index.config.name === 'creative_asset_versions_asset_approved_idx'
    )
    expect(approvedIndex?.config.unique).toBe(true)
    expect(approvedIndex?.config.where).toBeDefined()
  })

  it('exports reusable asset derivatives with one active thumbnail per asset', () => {
    expect(assetDerivatives.assetId).toBeDefined()
    expect(assetDerivatives.kind).toBeDefined()
    expect(assetDerivatives.status).toBeDefined()
    expect(assetDerivatives.storageKey).toBeDefined()

    const tableInternals = assetDerivatives as unknown as Record<symbol, unknown>
    const extraConfigBuilder = tableInternals[Symbol.for('drizzle:ExtraConfigBuilder')]
    const extraConfigColumns = tableInternals[Symbol.for('drizzle:ExtraConfigColumns')]
    if (typeof extraConfigBuilder !== 'function') {
      throw new Error('expected asset_derivatives extra config builder')
    }

    const indexes = extraConfigBuilder(extraConfigColumns) as IndexConfigProbe[]
    const assetKindIndex = indexes.find(index =>
      'config' in index && index.config.name === 'asset_derivatives_asset_kind_idx'
    )
    expect(assetKindIndex?.config.unique).toBe(true)
    expect(assetKindIndex?.config.where).toBeDefined()
  })

  it('exports generation shares with a unique per-record index', () => {
    expect(generationShares).toBeDefined()
    expect(generationShares.id).toBeDefined()
    expect(generationShares.recordId).toBeDefined()
    expect(generationShares.userId).toBeDefined()

    const tableInternals = generationShares as unknown as Record<symbol, unknown>
    const extraConfigBuilder = tableInternals[Symbol.for('drizzle:ExtraConfigBuilder')]
    const extraConfigColumns = tableInternals[Symbol.for('drizzle:ExtraConfigColumns')]
    if (typeof extraConfigBuilder !== 'function') {
      throw new Error('expected generation_shares extra config builder')
    }

    const indexes = extraConfigBuilder(extraConfigColumns) as IndexConfigProbe[]
    const recordIndex = indexes.find(index =>
      'config' in index && index.config.name === 'generation_shares_record_idx'
    )

    expect(recordIndex?.config.unique).toBe(true)
  })

  it('creates DB clients with a public close method', async () => {
    const url = process.env.DATABASE_URL ?? 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
    const db = createDb({ url, max: 1 })

    expect(db.close).toBeInstanceOf(Function)
    await expect(db.close()).resolves.toBeUndefined()
  })

  it('defines idempotency uniqueness as a partial index', () => {
    const tableInternals = generationRecords as unknown as Record<symbol, unknown>
    const extraConfigBuilder = tableInternals[Symbol.for('drizzle:ExtraConfigBuilder')]
    const extraConfigColumns = tableInternals[Symbol.for('drizzle:ExtraConfigColumns')]
    if (typeof extraConfigBuilder !== 'function') {
      throw new Error('expected generation_records extra config builder')
    }

    const indexes = extraConfigBuilder(extraConfigColumns) as IndexConfigProbe[]
    const idempotencyIndex = indexes.find(index =>
      'config' in index && index.config.name === 'generation_records_user_idempotency_key_idx'
    )

    expect(idempotencyIndex?.config.unique).toBe(true)
    expect(idempotencyIndex?.config.where).toBeDefined()
  })
})
