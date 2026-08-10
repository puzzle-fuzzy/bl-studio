import { describe, expect, it } from 'vitest'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult, StorageWriteStreamInput } from '@bailian-studio/storage'
import { assetDownloadStorageKey, uploadAsset } from '../src/modules/assets/service'
import { parseMediaDuration } from '../src/modules/assets/media-metadata'
import type { AssetConfig } from '../src/lib/asset-config'

const testAssetConfig: AssetConfig = {
  maxAssetSizeBytes: 100 * 1024 * 1024,
  maxMediaDurationSeconds: 30 * 60,
  ffprobePath: 'ffprobe',
}

/** P1-16：测试夹具用真实魔数头，sniff 校验才不会误杀。 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MP4_MAGIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]

class TestStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''
  deleteCalls: string[] = []
  /** P1-16：统计是否走了流式写。 */
  streamedKeys: string[] = []
  streamedContentLengths: Array<number | undefined> = []

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    return { provider: 'local', key: input.key, byteSize: input.body.byteLength, url: `/stored/${input.key}` }
  }

  async writeObjectStream(input: StorageWriteStreamInput): Promise<StorageWriteResult> {
    this.streamedKeys.push(input.key)
    this.streamedContentLengths.push(input.contentLength)
    const reader = input.stream.getReader()
    let byteSize = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      byteSize += value.byteLength
    }
    return { provider: 'local', key: input.key, byteSize, url: `/stored/${input.key}` }
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
      file: new File([new Uint8Array(MP4_MAGIC)], 'clip.mp4', { type: 'video/mp4' }),
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
      file: new File([new Uint8Array(MP4_MAGIC)], 'clip.mp4', { type: 'video/mp4' }),
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
      file: new File([new Uint8Array(PNG_MAGIC)], 'image.png', { type: 'image/png' }),
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

describe('asset upload streaming and magic-number validation', () => {
  it('streams to writeObjectStream when the adapter supports it', async () => {
    const storage = new TestStorage()
    const repository = { createUserAsset: async () => undefined } as unknown as GenerationRepository

    await uploadAsset({
      file: new File([new Uint8Array(PNG_MAGIC)], 'image.png', { type: 'image/png' }),
      userId: 'user_1',
      kindParam: null,
      storage,
      repository,
      config: testAssetConfig,
    })

    expect(storage.streamedKeys).toHaveLength(1)
    expect(storage.streamedKeys[0]).toMatch(/^user_uploads\/user_1\//)
    expect(storage.streamedContentLengths).toEqual([PNG_MAGIC.length])
  })

  it('rejects media whose magic number does not match the declared type', async () => {
    const storage = new TestStorage()
    const repository = { createUserAsset: async () => undefined } as unknown as GenerationRepository

    await expect(uploadAsset({
      file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'fake.mp4', { type: 'video/mp4' }),
      userId: 'user_1',
      kindParam: null,
      storage,
      repository,
      config: testAssetConfig,
    })).rejects.toThrow('文件内容与声明的类型不符')
    expect(storage.streamedKeys).toHaveLength(0)
    expect(storage.deleteCalls).toHaveLength(0)
  })

  it('rejects an image/png declared file whose body is not PNG', async () => {
    const storage = new TestStorage()
    const repository = { createUserAsset: async () => undefined } as unknown as GenerationRepository

    await expect(uploadAsset({
      file: new File(['just text'], 'image.png', { type: 'image/png' }),
      userId: 'user_1',
      kindParam: null,
      storage,
      repository,
      config: testAssetConfig,
    })).rejects.toThrow('文件内容与声明的类型不符')
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
