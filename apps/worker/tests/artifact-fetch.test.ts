import { describe, expect, it } from 'vitest'
import { ArtifactFetchError, fetchProviderArtifact, type ArtifactFetch } from '../src/artifact-fetch'

function imageResponse(body: BodyInit, headers: Record<string, string> = { 'content-type': 'image/png' }) {
  return new Response(body, { status: 200, headers })
}

describe('fetchProviderArtifact', () => {
  it('rejects private or non-HTTPS provider URLs before making a request', async () => {
    let calls = 0
    const fetchImpl: ArtifactFetch = async () => {
      calls += 1
      return imageResponse(new Uint8Array([1]))
    }

    await expect(fetchProviderArtifact({
      url: 'https://127.0.0.1/internal.png',
      kind: 'image',
      maxBytes: 10,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'HOST_REJECTED' })
    await expect(fetchProviderArtifact({
      url: 'http://cdn.example.test/image.png',
      kind: 'image',
      maxBytes: 10,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'ARTIFACT_URL_REJECTED' })
    expect(calls).toBe(0)
  })

  it('accepts bounded inline data artifacts without making a network request', async () => {
    let calls = 0
    const fetchImpl: ArtifactFetch = async () => {
      calls += 1
      return imageResponse(new Uint8Array([9]))
    }

    const result = await fetchProviderArtifact({
      url: 'data:image/png;base64,AQID',
      kind: 'image',
      maxBytes: 3,
      fetch: fetchImpl,
    })

    expect(result.contentType).toBe('image/png')
    expect(result.contentLength).toBe(3)
    await expect(result.consume()).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(calls).toBe(0)
  })

  it('accepts DashScope accelerated OSS result hosts', async () => {
    const result = await fetchProviderArtifact({
      url: 'https://dashscope-7c2c.oss-accelerate.aliyuncs.com/result.png',
      kind: 'image',
      maxBytes: 10,
      fetch: async () => imageResponse(new Uint8Array([1, 2, 3])),
    })

    await expect(result.consume()).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })

  it('revalidates every redirect against the allowed host policy', async () => {
    const requested: string[] = []
    const fetchImpl: ArtifactFetch = async (input) => {
      requested.push(String(input))
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.test/steal.png' },
      })
    }

    await expect(fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 10,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'REDIRECT_REJECTED' })
    expect(requested).toEqual(['https://cdn.example.test/image.png'])
  })

  it('uses a manual redirect policy and never forwards credential headers', async () => {
    let init: RequestInit | undefined
    const fetchImpl: ArtifactFetch = async (_input, requestInit) => {
      init = requestInit
      return imageResponse(new Uint8Array([1, 2, 3]))
    }

    const result = await fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 10,
      fetch: fetchImpl,
    })

    expect(init?.redirect).toBe('manual')
    expect(init?.credentials).toBe('omit')
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    expect(new Headers(init?.headers).has('proxy-authorization')).toBe(false)
    await expect(result.consume()).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rejects a MIME type that does not match the artifact kind', async () => {
    const fetchImpl: ArtifactFetch = async () => imageResponse('not audio', { 'content-type': 'text/plain' })

    await expect(fetchProviderArtifact({
      url: 'https://cdn.example.test/audio.mp3',
      kind: 'audio',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 100,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'MIME_REJECTED' })
  })

  it('rejects a declared body larger than the configured limit', async () => {
    const fetchImpl: ArtifactFetch = async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '3' },
    })

    await expect(fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 2,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('enforces the body limit while streaming when content length is absent', async () => {
    const fetchImpl: ArtifactFetch = async () => imageResponse(new Uint8Array([1, 2, 3]))
    const result = await fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 2,
      fetch: fetchImpl,
    })

    await expect(result.consume()).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('maps an aborted fetch after the deadline to a structured timeout', async () => {
    const fetchImpl: ArtifactFetch = async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      throw new Error('unreachable')
    }

    await expect(fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 10,
      timeoutMs: 5,
      fetch: fetchImpl,
    })).rejects.toBeInstanceOf(ArtifactFetchError)
    await expect(fetchProviderArtifact({
      url: 'https://cdn.example.test/image.png',
      kind: 'image',
      allowedHosts: ['cdn.example.test'],
      maxBytes: 10,
      timeoutMs: 5,
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})
