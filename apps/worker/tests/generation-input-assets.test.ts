import { describe, expect, it } from 'vitest'
import type { GenerationInputAsset } from '@bailian-studio/generation-repository'
import { getModelById } from '@bailian-studio/dashscope-manifests'
import type {
  StorageAdapter,
  StorageReadUrlInput,
  StorageWriteInput,
  StorageWriteResult,
} from '@bailian-studio/storage'
import {
  GenerationInputAssetResolutionError,
  resolveGenerationInputParams,
} from '../src/generation-input-assets'

const qwenImageEdit = getModelById('qwen-image-edit')
if (qwenImageEdit === undefined) {
  throw new Error('qwen-image-edit manifest missing from registry — test setup failed')
}

class SigningStorage implements StorageAdapter {
  readonly provider = 'oss' as const
  readonly keyPrefix = ''
  readonly reads: StorageReadUrlInput[] = []
  readError: Error | undefined

  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.reject(new Error('SigningStorage.writeObject is not used'))
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    this.reads.push(input)
    if (this.readError !== undefined) return Promise.reject(this.readError)
    return Promise.resolve(`https://media.example.com/${input.key}?signature=${this.reads.length}`)
  }
}

function storedAsset(overrides: Partial<GenerationInputAsset> = {}): GenerationInputAsset {
  return {
    generationId: 'generation-1',
    parameterName: 'image',
    position: 0,
    assetId: 'asset-1',
    userId: 'user-1',
    kind: 'image',
    source: 'upload',
    storageProvider: 'oss',
    storageKey: 'users/user-1/assets/asset-1.png',
    ...overrides,
  }
}

describe('resolveGenerationInputParams', () => {
  it('signs stored assets freshly and preserves multi-reference position order without mutating persisted params', async () => {
    const storage = new SigningStorage()
    const persistedParams = { prompt: 'turn these references into a poster' }
    const assets = [
      storedAsset({
        position: 1,
        assetId: 'asset-2',
        storageKey: 'users/user-1/assets/asset-2.png',
      }),
      storedAsset(),
    ]

    const first = await resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams,
      assets,
      storage,
    })
    const second = await resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams,
      assets,
      storage,
    })

    expect(first).toEqual({
      prompt: 'turn these references into a poster',
      image: [
        'https://media.example.com/users/user-1/assets/asset-1.png?signature=1',
        'https://media.example.com/users/user-1/assets/asset-2.png?signature=2',
      ],
    })
    expect(second.image).toEqual([
      'https://media.example.com/users/user-1/assets/asset-1.png?signature=3',
      'https://media.example.com/users/user-1/assets/asset-2.png?signature=4',
    ])
    expect(persistedParams).toEqual({ prompt: 'turn these references into a poster' })
    expect(storage.reads).toEqual([
      { key: 'users/user-1/assets/asset-1.png', expiresInSeconds: 900 },
      { key: 'users/user-1/assets/asset-2.png', expiresInSeconds: 900 },
      { key: 'users/user-1/assets/asset-1.png', expiresInSeconds: 900 },
      { key: 'users/user-1/assets/asset-2.png', expiresInSeconds: 900 },
    ])
  })

  it('uses a validated original link without asking storage to sign it', async () => {
    const storage = new SigningStorage()

    const resolved = await resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams: { prompt: 'edit it' },
      assets: [
        storedAsset({
          source: 'link',
          storageProvider: undefined,
          storageKey: undefined,
          originalUrl: 'https://assets.example.com/reference.png',
        }),
      ],
      storage,
    })

    expect(resolved.image).toEqual(['https://assets.example.com/reference.png'])
    expect(storage.reads).toEqual([])
  })

  it.each(['upload', 'generation', 'derived'] as const)(
    'requires durable storage coordinates for a %s asset even when a legacy original URL exists',
    async source => {
      const storage = new SigningStorage()

      await expect(resolveGenerationInputParams({
        manifest: qwenImageEdit,
        persistedParams: { prompt: 'edit it' },
        assets: [
          storedAsset({
            source,
            storageProvider: undefined,
            storageKey: undefined,
            originalUrl: 'https://legacy.example.com/should-not-be-used.png?token=secret',
          }),
        ],
        storage,
      })).rejects.toMatchObject({
        info: {
          category: 'validation',
          code: 'GENERATION_INPUT_ASSET_STORAGE_MISSING',
          retriable: false,
          details: {
            assetId: 'asset-1',
            parameterName: 'image',
            position: 0,
          },
        },
      })
      expect(storage.reads).toEqual([])
    },
  )

  it('wraps storage signing failures as safe retriable system errors', async () => {
    const storage = new SigningStorage()
    storage.readError = new Error(
      'OSS secret and signed URL https://media.example.com/private.png?signature=do-not-leak',
    )

    const promise = resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams: { prompt: 'edit it' },
      assets: [storedAsset()],
      storage,
    })

    await expect(promise).rejects.toMatchObject({
      info: {
        category: 'system',
        code: 'GENERATION_INPUT_ASSET_STORAGE_UNAVAILABLE',
        message: 'Unable to create a provider-readable URL for generation input asset',
        retriable: true,
        details: {
          assetId: 'asset-1',
          parameterName: 'image',
          position: 0,
        },
      },
    })
    await expect(promise).rejects.not.toHaveProperty(
      'info.message',
      expect.stringContaining('do-not-leak'),
    )
  })

  it.each([
    ['relative URL', '/api/assets/local/reference.png'],
    ['credential-bearing URL', 'https://username:password@assets.example.com/reference.png'],
    ['non-HTTP URL', 'file:///var/assets/reference.png'],
  ])('rejects a %s before provider execution', async (_label, originalUrl) => {
    const storage = new SigningStorage()

    const promise = resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams: { prompt: 'edit it' },
      assets: [
        storedAsset({
          source: 'link',
          storageProvider: undefined,
          storageKey: undefined,
          originalUrl,
        }),
      ],
      storage,
    })

    await expect(promise).rejects.toBeInstanceOf(GenerationInputAssetResolutionError)
    await expect(promise).rejects.toMatchObject({
      info: {
        category: 'validation',
        code: 'GENERATION_INPUT_ASSET_URL_INVALID',
        retriable: false,
      },
    })
  })

  it('rejects storage coordinates owned by a different configured provider', async () => {
    const storage = new SigningStorage()

    await expect(resolveGenerationInputParams({
      manifest: qwenImageEdit,
      persistedParams: { prompt: 'edit it' },
      assets: [storedAsset({ storageProvider: 'local' })],
      storage,
    })).rejects.toMatchObject({
      info: {
        code: 'GENERATION_INPUT_ASSET_STORAGE_MISMATCH',
        retriable: false,
      },
    })
    expect(storage.reads).toEqual([])
  })
})
