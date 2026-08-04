import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalStorageAdapter } from '../src'

let roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots = []
})

describe('LocalStorageAdapter', () => {
  it('writes objects under the configured root and returns a local read URL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({ rootDir: root, publicBaseUrl: '/api/artifacts/local' })

    const result = await adapter.writeObject({
      key: 'generations/gen_1/art_1.txt',
      body: new TextEncoder().encode('hello'),
      contentType: 'text/plain',
    })

    expect(result).toEqual({
      provider: 'local',
      key: 'generations/gen_1/art_1.txt',
      url: '/api/artifacts/local/generations/gen_1/art_1.txt',
      byteSize: 5,
    })
    expect(await readFile(join(root, 'generations/gen_1/art_1.txt'), 'utf8')).toBe('hello')
    if (result.url === undefined) throw new Error('expected local write URL')
    expect(await adapter.createReadUrl({ key: result.key, expiresInSeconds: 300 })).toBe(result.url)
  })

  it('reports the local root as healthy only when it is a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({ rootDir: root, publicBaseUrl: '/api/artifacts/local' })
    await expect(adapter.healthCheck()).resolves.toBeUndefined()
  })

  it('serves historical physical keys without applying the active namespace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({
      rootDir: root,
      publicBaseUrl: '/api/artifacts/local',
      keyPrefix: 'bailian-studio',
    })

    expect(await adapter.createReadUrl({ key: 'bailian-studio/generations/gen_1/art_1.png', expiresInSeconds: 300 })).toBe(
      '/api/artifacts/local/bailian-studio/generations/gen_1/art_1.png',
    )
  })

  it('marks download URLs without changing ordinary authenticated local URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({ rootDir: root, publicBaseUrl: '/api/artifacts/local' })

    expect(await adapter.createReadUrl({ key: 'uploads/report.png', expiresInSeconds: 300 })).toBe(
      '/api/artifacts/local/uploads/report.png',
    )
    expect(await adapter.createReadUrl({
      key: 'uploads/report.png',
      expiresInSeconds: 300,
      downloadFileName: '报告.png',
    })).toBe('/api/artifacts/local/uploads/report.png?download=1')
  })

  it('reads a persisted object through the storage boundary with a byte limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({ rootDir: root, publicBaseUrl: '/api/artifacts/local' })
    await adapter.writeObject({ key: 'uploads/video.mp4', body: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4' })

    const reader = adapter as unknown as {
      readObject(input: { key: string; maxBytes: number }): Promise<{ body: Uint8Array; contentType?: string }>
    }
    await expect(reader.readObject({ key: 'uploads/video.mp4', maxBytes: 4 })).resolves.toEqual({
      body: new Uint8Array([1, 2, 3, 4]),
    })
    await expect(reader.readObject({ key: 'uploads/video.mp4', maxBytes: 3 })).rejects.toThrow('storage object exceeds limit')
  })

  it('rejects unsafe object keys before writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-'))
    roots.push(root)
    const adapter = new LocalStorageAdapter({ rootDir: root, publicBaseUrl: '/api/artifacts/local' })
    const unsafeKeys = ['C:/x', 'C:\\x', 'C:x', '//server/share/x', '\\\\server\\share\\x', '/x', '../x', '..\\x']

    for (const key of unsafeKeys) {
      await expect(
        adapter.writeObject({
          key,
          body: new TextEncoder().encode('unsafe'),
        }),
      ).rejects.toThrow('unsafe storage key')
    }
  })
})
