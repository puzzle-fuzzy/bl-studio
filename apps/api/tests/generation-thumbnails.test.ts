import { describe, expect, it } from 'vitest'
import type { GenerationArtifact, GenerationRecord } from '@bailian-studio/generation-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { attachGenerationThumbnailUrls } from '../src/modules/generations/thumbnails'

class LocalStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''

  writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.resolve({ provider: 'local', key: input.key, byteSize: input.body.byteLength })
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    return Promise.resolve(`/api/artifacts/local/${input.key}`)
  }
}

const record: GenerationRecord = {
  id: 'generation_thumbnail_1',
  userId: 'user_1',
  modelId: 'qwen-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  category: 'image',
  inputParams: { prompt: 'portrait' },
  visibility: 'private',
  status: 'succeeded',
  outputResult: {
    artifacts: [{ kind: 'image', sourceUrl: 'https://provider.example/full.png' }],
  },
  costEstimate: 20,
  currency: 'CNY',
  pricingVersion: 'test',
  modelManifestHash: 'test',
  providerCancelStatus: 'not_requested',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:01:00.000Z',
}

function artifact(status: 'queued' | 'ready'): GenerationArtifact {
  return {
    id: 'artifact_thumbnail_1',
    recordId: record.id,
    userId: record.userId,
    kind: 'image',
    sourceUrl: 'https://provider.example/full.png',
    storageProvider: 'local',
    storageKey: 'generations/full.png',
    status: 'stored',
    thumbnailStatus: status,
    ...(status === 'ready'
      ? {
          thumbnailStorageProvider: 'local' as const,
          thumbnailStorageKey: 'asset-thumbnails/thumb.webp',
        }
      : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

describe('generation list thumbnails', () => {
  it('attaches a persisted local thumbnail while preserving the original output URL', async () => {
    const [decorated] = await attachGenerationThumbnailUrls([record], [artifact('ready')], new LocalStorage())
    const artifacts = decorated?.outputResult?.['artifacts']
    expect(Array.isArray(artifacts) ? artifacts[0] : undefined).toEqual({
      kind: 'image',
      sourceUrl: 'https://provider.example/full.png',
      thumbnailStatus: 'ready',
      thumbnailUrl: '/api/artifacts/local/asset-thumbnails/thumb.webp',
    })
  })

  it('reports a pending derivative without falling back to the original as a thumbnail', async () => {
    const [decorated] = await attachGenerationThumbnailUrls([record], [artifact('queued')], new LocalStorage())
    const artifacts = decorated?.outputResult?.['artifacts']
    expect(Array.isArray(artifacts) ? artifacts[0] : undefined).toEqual({
      kind: 'image',
      sourceUrl: 'https://provider.example/full.png',
      thumbnailStatus: 'queued',
    })
  })
})
