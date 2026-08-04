import { describe, expect, it } from 'vitest'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { assetDownloadStorageKey, uploadAsset } from '../src/modules/assets/service'
import { parseMediaDuration } from '../src/modules/assets/media-metadata'
import type { AssetConfig } from '../src/lib/asset-config'

const testAssetConfig: AssetConfig = {
  maxAssetSizeBytes: 100 * 1024 * 1024,
  maxMediaDurationSeconds: 30 * 60,
  ffprobePath: 'ffprobe',
}

class TestStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''
  deleteCalls: string[] = []

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    return { provider: 'local', key: input.key, byteSize: input.body.byteLength, url: `/stored/${input.key}` }
  }

  async createReadUrl(input: StorageReadUrlInput): Promise<string> {
    return `/read/${input.key}`
  }

  async deleteObject(input: { key: string }): Promise<void> {
    this.deleteCalls.push(input.key)
  }
}

describe('asset media duration validation', () => {
  it('parses format duration and falls back to audio/video stream durations', () => {
    expect(parseMediaDuration(JSON.stringify({ format: { duration: '12.5' } }))).toBe(12.5)
    expect(parseMediaDuration(JSON.stringify({
      streams: [{ codec_type: 'video', duration: '7.25' }, { codec_type: 'data', duration: '99' }],
    }))).toBe(7.25)
  })

  it('stores the authoritative probed duration in asset metadata', async () => {
    let created: { metadata?: Record<string, unknown>; enqueueThumbnail?: boolean } | undefined
    const repository = {
      createUserAsset: async (input: { metadata?: Record<string, unknown>; enqueueThumbnail?: boolean }) => {
        created = input
      },
    } as unknown as GenerationRepository

    const result = await uploadAsset({
      file: new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' }),
      userId: 'user_1',
      kindParam: null,
      storage: new TestStorage(),
      repository,
      config: testAssetConfig,
      probeMediaDuration: async () => 12.5,
    })

    expect(result.durationSeconds).toBe(12.5)
    expect(created).toMatchObject({
      metadata: { durationSeconds: 12.5 },
      enqueueThumbnail: true,
    })
  })

  it('rejects media longer than the configured maximum before storage', async () => {
    const repository = { createUserAsset: async () => undefined } as unknown as GenerationRepository
    await expect(uploadAsset({
      file: new File([new Uint8Array([1])], 'clip.mp4', { type: 'video/mp4' }),
      userId: 'user_1',
      kindParam: null,
      storage: new TestStorage(),
      repository,
      config: { ...testAssetConfig, maxMediaDurationSeconds: 10 },
      probeMediaDuration: async () => 10.1,
    })).rejects.toThrow('超过限制')
  })

  it('compensates a successful storage write when the asset row fails', async () => {
    const storage = new TestStorage()
    const repository = {
      createUserAsset: async () => { throw new Error('database unavailable') },
    } as unknown as GenerationRepository

    await expect(uploadAsset({
      file: new File([new Uint8Array([1])], 'image.png', { type: 'image/png' }),
      userId: 'user_1',
      kindParam: null,
      storage,
      repository,
      config: testAssetConfig,
    })).rejects.toThrow('database unavailable')

    expect(storage.deleteCalls).toHaveLength(1)
    expect(storage.deleteCalls[0]).toMatch(/^user_uploads\/user_1\//)
  })
})

describe('asset download storage selection', () => {
  const storage = new TestStorage()
  const cases = [
    {
      name: 'matching provider and stored key',
      asset: { storageProvider: 'local', storageKey: 'uploads/report.png' },
      expected: 'uploads/report.png',
    },
    {
      name: 'missing storage key',
      asset: { storageProvider: 'local' },
      expected: undefined,
    },
    {
      name: 'matching provider and empty storage key',
      asset: { storageProvider: 'local', storageKey: '' },
      expected: undefined,
    },
    {
      name: 'missing storage provider',
      asset: { storageKey: 'uploads/report.png' },
      expected: undefined,
    },
    {
      name: 'provider mismatch',
      asset: { storageProvider: 'oss', storageKey: 'uploads/report.png' },
      expected: undefined,
    },
  ] as const

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(assetDownloadStorageKey(testCase.asset, storage)).toBe(testCase.expected)
    })
  }
})
