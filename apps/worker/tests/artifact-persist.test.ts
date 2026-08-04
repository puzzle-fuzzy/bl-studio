import { describe, expect, it } from 'vitest'
import { artifactStorageKey, persistArtifactsForRecord } from '../src/artifact-persist'
import { FakeRepository, FakeStorageAdapter, makeArtifact } from './fixtures'

describe('persistArtifactsForRecord', () => {
  it('stores a pending text artifact through the storage adapter', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    repo.artifacts.set('artifact_1', makeArtifact({ text: 'hello artifact' }))

    const result = await persistArtifactsForRecord({
      recordId: 'rec_1',
      repository: repo,
      storage,
      now: '2026-06-28T00:00:01.000Z',
    })

    expect(result.storedCount).toBe(1)
    expect(storage.writes).toHaveLength(1)
    const write = storage.writes[0]
    if (write === undefined) throw new Error('expected storage write')
    expect(write.key).toBe('generations/rec_1/artifact_1.txt')
    expect(write.contentType).toBe('text/plain; charset=utf-8')
    expect(new TextDecoder().decode(write.body)).toBe('hello artifact')

    const artifact = repo.artifacts.get('artifact_1')
    expect(artifact?.status).toBe('stored')
    expect(artifact?.storageKey).toBe('generations/rec_1/artifact_1.txt')
    expect(artifact?.byteSize).toBe(14)
    expect(repo.mutations.map(m => m.kind)).toEqual(['markArtifactStored'])
  })

  it('marks the artifact failed when storage rejects', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    storage.throwError = new Error('upload timeout')
    repo.artifacts.set('artifact_1', makeArtifact())

    await expect(
      persistArtifactsForRecord({
        recordId: 'rec_1',
        repository: repo,
        storage,
      }),
    ).rejects.toThrow('upload timeout')

    expect(repo.artifacts.get('artifact_1')?.status).toBe('failed')
    const failed = repo.mutations.find(m => m.kind === 'markArtifactFailed')
    expect(failed?.kind).toBe('markArtifactFailed')
    if (failed?.kind !== 'markArtifactFailed') throw new Error('expected markArtifactFailed mutation')
    expect(failed.input.error.retriable).toBe(true)
  })

  it('marks the artifact failed and rethrows when the artifact has no payload source', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    // 既无 text 也无 sourceUrl → readArtifactPayload 在触及存储之前即抛错。
    repo.artifacts.set('artifact_1', makeArtifact({ text: undefined, sourceUrl: undefined, mimeType: undefined }))

    await expect(
      persistArtifactsForRecord({ recordId: 'rec_1', repository: repo, storage }),
    ).rejects.toThrow(/neither text nor sourceUrl/)

    expect(storage.writes).toHaveLength(0)
    expect(repo.artifacts.get('artifact_1')?.status).toBe('failed')
    const failed = repo.mutations.find(m => m.kind === 'markArtifactFailed')
    if (failed?.kind !== 'markArtifactFailed') throw new Error('expected markArtifactFailed mutation')
    // "neither text nor sourceUrl" 不匹配可重试的正则模式。
    expect(failed.input.error.retriable).toBe(false)
    expect(failed.input.error.category).toBe('storage')
  })

  it('fetches a sourceUrl artifact through the injected fetch and stores its bytes', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    repo.artifacts.set('artifact_1', makeArtifact({
      kind: 'image',
      text: undefined,
      mimeType: undefined,
      sourceUrl: 'https://cdn.test/image.png',
    }))

    const bytes = new TextEncoder().encode('png-bytes')
    const fakeFetch = async () =>
      new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })

    const result = await persistArtifactsForRecord({
      recordId: 'rec_1',
      repository: repo,
      storage,
      artifactFetch: { allowedHosts: ['cdn.test'] },
      fetch: fakeFetch as unknown as typeof fetch,
    })

    expect(result.storedCount).toBe(1)
    const write = storage.writes[0]
    if (write === undefined) throw new Error('expected storage write')
    expect(write.key).toBe('generations/rec_1/artifact_1.png')
    expect(write.contentType).toBe('image/png')
    expect(Buffer.from(write.body)).toEqual(Buffer.from(bytes))
    expect(repo.artifacts.get('artifact_1')?.status).toBe('stored')
  })

  it('marks the artifact failed when the source fetch returns a non-OK status', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    repo.artifacts.set('artifact_1', makeArtifact({
      kind: 'image',
      text: undefined,
      mimeType: undefined,
      sourceUrl: 'https://cdn.test/missing.png',
    }))
    const fakeFetch = async () => new Response('not found', { status: 404 })

    await expect(
      persistArtifactsForRecord({
        recordId: 'rec_1',
        repository: repo,
        storage,
        artifactFetch: { allowedHosts: ['cdn.test'] },
        fetch: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Provider artifact fetch failed/)

    expect(repo.artifacts.get('artifact_1')?.status).toBe('failed')
  })

  it('rejects a provider source URL outside the configured host policy before fetching', async () => {
    const repo = new FakeRepository()
    const storage = new FakeStorageAdapter()
    repo.artifacts.set('artifact_1', makeArtifact({
      kind: 'image',
      text: undefined,
      mimeType: undefined,
      sourceUrl: 'https://evil.test/image.png',
    }))
    const fakeFetch = async () => {
      throw new Error('fetch must not be called for rejected hosts')
    }

    await expect(
      persistArtifactsForRecord({
        recordId: 'rec_1',
        repository: repo,
        storage,
        artifactFetch: { allowedHosts: ['cdn.test'] },
        fetch: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ taskError: { code: 'ARTIFACT_PERSIST_FAILED', retriable: false } })

    expect(storage.writes).toHaveLength(0)
    expect(repo.artifacts.get('artifact_1')?.status).toBe('failed')
  })
})

describe('artifactStorageKey', () => {
  it('uses .mp3 for audio/mpeg (DashScope music output)', () => {
    // 回归测试：音频 artifact 曾保存为 .mpeg，浏览器/操作系统会把它当作视频容器。
    // MP3 的标准 MIME 是 audio/mpeg。
    expect(artifactStorageKey('rec_1', 'art_1', 'audio/mpeg', 'audio')).toBe(
      'generations/rec_1/art_1.mp3',
    )
  })

  it('uses .mp3 for an audio artifact with no content type', () => {
    expect(artifactStorageKey('rec_1', 'art_1', undefined, 'audio')).toBe(
      'generations/rec_1/art_1.mp3',
    )
  })

  it('preserves image/video/text extensions by content type', () => {
    expect(artifactStorageKey('rec_1', 'art_1', 'image/png', 'image')).toBe(
      'generations/rec_1/art_1.png',
    )
    expect(artifactStorageKey('rec_1', 'art_1', 'video/mp4', 'video')).toBe(
      'generations/rec_1/art_1.mp4',
    )
    expect(artifactStorageKey('rec_1', 'art_1', 'text/plain', 'text')).toBe(
      'generations/rec_1/art_1.txt',
    )
  })

  it('falls back to the artifact kind when the content type is unrecognized', () => {
    expect(artifactStorageKey('rec_1', 'art_1', undefined, 'image')).toBe('generations/rec_1/art_1.png')
    expect(artifactStorageKey('rec_1', 'art_1', undefined, 'video')).toBe('generations/rec_1/art_1.mp4')
    expect(artifactStorageKey('rec_1', 'art_1', undefined, 'text')).toBe('generations/rec_1/art_1.txt')
    expect(artifactStorageKey('rec_1', 'art_1', 'application/zip', 'archive')).toBe('generations/rec_1/art_1.bin')
  })
})
