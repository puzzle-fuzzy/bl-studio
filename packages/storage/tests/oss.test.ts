import type { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  createOssClient,
  OssStorageAdapter,
  type OssClientLike,
} from '../src'

class FakeOssClient implements OssClientLike {
  putCalls: Array<{ key: string; body: Uint8Array; headers?: Record<string, string> }> = []
  signatureCalls: Array<{
    key: string
    expires: number
    process?: string
    response?: { 'content-disposition'?: string }
  }> = []
  deleteCalls: string[] = []
  getCalls: string[] = []
  headCalls: string[] = []
  putStreamCalls: Array<{ key: string; contentLength?: number; headers?: Record<string, string> }> = []

  async put(key: string, body: Uint8Array, options?: { headers?: Record<string, string> }): Promise<{ url?: string }> {
    this.putCalls.push({ key, body, headers: options?.headers })
    return { url: `oss://bucket/${key}` }
  }

  async putStream(
    key: string,
    stream: Readable,
    options?: { headers?: Record<string, string>; contentLength?: number },
  ): Promise<{ url?: string }> {
    this.putStreamCalls.push({
      key,
      ...(options?.contentLength !== undefined ? { contentLength: options.contentLength } : {}),
      ...(options?.headers !== undefined ? { headers: options.headers } : {}),
    })
    for await (const _chunk of stream) {
      // Consume the stream as the real SDK does.
    }
    return { url: `oss://bucket/${key}` }
  }

  signatureUrl(key: string, options: {
    expires: number
    process?: string
    response?: { 'content-disposition'?: string }
  }): string {
    this.signatureCalls.push({
      key,
      expires: options.expires,
      ...(options.process !== undefined ? { process: options.process } : {}),
      ...(options.response !== undefined ? { response: options.response } : {}),
    })
    return `https://signed.test/${key}?expires=${options.expires}${options.process === undefined ? '' : `&process=${encodeURIComponent(options.process)}`}`
  }

  async delete(key: string): Promise<void> {
    this.deleteCalls.push(key)
  }

  async head(key: string): Promise<void> {
    this.headCalls.push(key)
  }

  async get(key: string): Promise<{ content: Uint8Array; res?: { headers?: Record<string, string> } }> {
    this.getCalls.push(key)
    return { content: new Uint8Array([7, 8]), res: { headers: { 'content-type': 'video/mp4' } } }
  }
}

describe('OssStorageAdapter', () => {
  it('writes objects through ali-oss and generates signed URLs', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    const result = await adapter.writeObject({
      key: 'generations/gen_1/art_1.png',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    })

    expect(result).toEqual({
      provider: 'oss',
      key: 'generations/gen_1/art_1.png',
      url: 'oss://bucket/generations/gen_1/art_1.png',
      byteSize: 3,
    })
    expect(client.putCalls[0]?.headers).toEqual({ 'Content-Type': 'image/png' })
    expect(await adapter.createReadUrl({ key: result.key, expiresInSeconds: 60 })).toBe(
      'https://signed.test/generations/gen_1/art_1.png?expires=60',
    )
  })

  it('passes a known stream length to ali-oss to avoid chunked uploads', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    await expect(adapter.writeObjectStream({
      key: 'user_uploads/user_1/image.png',
      stream: new Blob(['hello']).stream(),
      contentType: 'image/png',
      contentLength: 5,
    })).resolves.toMatchObject({
      provider: 'oss',
      key: 'user_uploads/user_1/image.png',
      byteSize: 5,
    })

    expect(client.putStreamCalls).toEqual([{
      key: 'user_uploads/user_1/image.png',
      contentLength: 5,
      headers: { 'Content-Type': 'image/png' },
    }])
  })

  it('probes OSS access without downloading an object', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    await expect(adapter.healthCheck()).resolves.toBeUndefined()
    expect(client.headCalls).toEqual(['health/ready'])
  })

  it('treats a missing readiness sentinel as a reachable bucket', async () => {
    const client = new FakeOssClient()
    client.head = async (key: string) => {
      client.headCalls.push(key)
      throw Object.assign(new Error('not found'), { status: 404 })
    }
    const adapter = new OssStorageAdapter({ client })

    await expect(adapter.healthCheck()).resolves.toBeUndefined()
  })

  it('does not apply the namespace prefix twice when reading a stored key', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client, keyPrefix: 'bailian-studio' })

    const result = await adapter.writeObject({
      key: 'generations/gen_1/art_1.png',
      body: new Uint8Array([1]),
    })

    expect(result.key).toBe('bailian-studio/generations/gen_1/art_1.png')
    await adapter.createReadUrl({ key: result.key, expiresInSeconds: 60 })
    expect(client.signatureCalls[0]).toEqual({ key: result.key, expires: 60 })
    expect(client.signatureCalls[0] && `https://signed.test/${client.signatureCalls[0].key}?expires=60`).toBe(
      'https://signed.test/bailian-studio/generations/gen_1/art_1.png?expires=60',
    )
  })

  it('signs historical physical keys without applying the active namespace', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client, keyPrefix: 'bailian-studio' })

    await adapter.createReadUrl({ key: 'bailian-studio/generations/gen_1/art_1.png', expiresInSeconds: 60 })
    await adapter.createReadUrl({ key: 'user_uploads/user_1/source.png', expiresInSeconds: 60 })
    await adapter.deleteObject({ key: 'bailian-studio/generations/gen_1/art_1.png' })

    expect(client.signatureCalls.map(call => call.key)).toEqual([
      'bailian-studio/generations/gen_1/art_1.png',
      'user_uploads/user_1/source.png',
    ])
    expect(client.deleteCalls).toEqual(['bailian-studio/generations/gen_1/art_1.png'])
  })

  it('reads the persisted physical key without applying the active namespace', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client, keyPrefix: 'bailian-studio' })
    const reader = adapter as unknown as {
      readObject(input: { key: string; maxBytes: number }): Promise<{ body: Uint8Array; contentType?: string }>
    }

    await expect(reader.readObject({ key: 'bailian-studio/user_uploads/source.mp4', maxBytes: 2 })).resolves.toEqual({
      body: new Uint8Array([7, 8]),
      contentType: 'video/mp4',
    })
    expect(client.getCalls).toEqual(['bailian-studio/user_uploads/source.mp4'])
  })

  it('includes provider processing in the signed URL input', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    const url = await adapter.createReadUrl({
      key: 'uploads/clip.mp4',
      expiresInSeconds: 3600,
      process: OSS_VIDEO_SNAPSHOT_PROCESS,
    })

    expect(client.signatureCalls[0]).toEqual({
      key: 'uploads/clip.mp4',
      expires: 3600,
      process: OSS_VIDEO_SNAPSHOT_PROCESS,
    })
    expect(url).toContain(`process=${encodeURIComponent(OSS_VIDEO_SNAPSHOT_PROCESS)}`)
  })

  it('signs a bounded WebP image thumbnail independently from the original', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    const originalUrl = await adapter.createReadUrl({
      key: 'uploads/source.png',
      expiresInSeconds: 3600,
    })
    const thumbnailUrl = await adapter.createReadUrl({
      key: 'uploads/source.png',
      expiresInSeconds: 3600,
      process: OSS_IMAGE_THUMBNAIL_PROCESS,
    })

    expect(originalUrl).not.toContain('process=')
    expect(client.signatureCalls[1]).toEqual({
      key: 'uploads/source.png',
      expires: 3600,
      process: OSS_IMAGE_THUMBNAIL_PROCESS,
    })
    expect(thumbnailUrl).toContain(`process=${encodeURIComponent(OSS_IMAGE_THUMBNAIL_PROCESS)}`)
  })

  it('signs an attachment response independently without changing ordinary reads', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    await adapter.createReadUrl({ key: 'uploads/report.png', expiresInSeconds: 3600 })
    await adapter.createReadUrl({
      key: 'uploads/report.png',
      expiresInSeconds: 3600,
      downloadFileName: '报告 2026.png',
    })

    expect(client.signatureCalls[0]).toEqual({ key: 'uploads/report.png', expires: 3600 })
    expect(client.signatureCalls[1]).toEqual({
      key: 'uploads/report.png',
      expires: 3600,
      response: {
        'content-disposition': `attachment; filename="2026.png"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026.png`,
      },
    })
  })

  it('rejects unsafe write keys instead of silently prefixing them (P1-33)', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    await expect(adapter.writeObject({
      key: '../escape/secret.png',
      body: new Uint8Array([1]),
    })).rejects.toThrow('unsafe storage key')
    await expect(adapter.writeObject({
      key: 'http://evil.example/path',
      body: new Uint8Array([1]),
    })).rejects.toThrow('unsafe storage key')
    expect(client.putCalls).toHaveLength(0)
  })

  it('clamps signed URL expiry into [1, 7 days] (P1-33)', async () => {
    const client = new FakeOssClient()
    const adapter = new OssStorageAdapter({ client })

    await adapter.createReadUrl({ key: 'uploads/a.png', expiresInSeconds: 0 })
    await adapter.createReadUrl({ key: 'uploads/b.png', expiresInSeconds: -5 })
    await adapter.createReadUrl({ key: 'uploads/c.png', expiresInSeconds: 30 * 24 * 3600 })
    await adapter.createReadUrl({ key: 'uploads/d.png', expiresInSeconds: 120.7 })

    expect(client.signatureCalls.map(call => call.expires)).toEqual([
      1,
      1,
      7 * 24 * 3600,
      120,
    ])
  })

  it('serializes the attachment response through the real ali-oss signer without network access', async () => {
    const adapter = new OssStorageAdapter({
      client: createOssClient({
        region: 'oss-cn-hangzhou',
        bucket: 'bailian-studio-test',
        accessKeyId: 'test-access-key',
        accessKeySecret: 'test-secret',
      }),
    })

    const signedUrl = await adapter.createReadUrl({
      key: 'uploads/report.png',
      expiresInSeconds: 60,
      downloadFileName: '报告 2026.png',
    })
    const parsedUrl = new URL(signedUrl)

    expect(parsedUrl.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="2026.png"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026.png`,
    )
  })
})
