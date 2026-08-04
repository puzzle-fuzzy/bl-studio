import { describe, expect, it } from 'vitest'
import type { GenerationArtifact } from '@bailian-studio/generation-repository'
import {
  OSS_IMAGE_THUMBNAIL_PROCESS,
  type StorageAdapter,
  type StorageReadUrlInput,
  type StorageWriteInput,
  type StorageWriteResult,
} from '@bailian-studio/storage'
import { resolveArtifactReadUrlUseCase } from '../src/modules/artifacts/service'

class FakeStorage implements StorageAdapter {
  readonly keyPrefix = ''
  readonly provider: 'local' | 'oss'
  readonly calls: StorageReadUrlInput[] = []

  constructor(provider: 'local' | 'oss') {
    this.provider = provider
  }

  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    throw new Error('not used')
  }

  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    this.calls.push(input)
    const process = input.process === undefined ? '' : `&process=${encodeURIComponent(input.process)}`
    return Promise.resolve(`/signed/${input.key}?ttl=${input.expiresInSeconds}${process}`)
  }
}

const artifact: GenerationArtifact = {
  id: 'art_1',
  recordId: 'gen_1',
  userId: 'user_1',
  kind: 'image',
  storageProvider: 'local',
  storageKey: 'generations/gen_1/art_1.png',
  status: 'stored',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
}

describe('artifact read URL use case', () => {
  it('uses an API-local URL for public local shares', async () => {
    const storage = new FakeStorage('local')
    const result = await resolveArtifactReadUrlUseCase({ storage }).execute({
      artifact,
      localReadUrl: '/api/shares/generations/share_1/artifacts/art_1',
    })

    expect(result).toEqual({
      ...artifact,
      readUrl: '/api/shares/generations/share_1/artifacts/art_1',
    })
    expect(storage.calls).toHaveLength(0)
  })

  it('returns separately signed original and thumbnail URLs for OSS images', async () => {
    const storage = new FakeStorage('oss')
    const result = await resolveArtifactReadUrlUseCase({ storage }).execute({ artifact })

    expect(result.readUrl).toBe('/signed/generations/gen_1/art_1.png?ttl=3600')
    expect(result.thumbnailUrl).toBe(
      `/signed/generations/gen_1/art_1.png?ttl=3600&process=${encodeURIComponent(OSS_IMAGE_THUMBNAIL_PROCESS)}`,
    )
    expect(storage.calls).toEqual([
      { key: artifact.storageKey!, expiresInSeconds: 3600 },
      {
        key: artifact.storageKey!,
        expiresInSeconds: 3600,
        process: OSS_IMAGE_THUMBNAIL_PROCESS,
      },
    ])
  })

  it('does not create a URL for pending or unstored artifacts', async () => {
    const storage = new FakeStorage('oss')
    const result = await resolveArtifactReadUrlUseCase({ storage }).execute({
      artifact: { ...artifact, status: 'pending', storageKey: undefined },
    })

    expect(result).toEqual({ ...artifact, status: 'pending', storageKey: undefined })
    expect(storage.calls).toHaveLength(0)
  })
})
