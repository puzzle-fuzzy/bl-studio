import { isIP } from 'node:net'

export type ProviderArtifactKind = 'image' | 'video' | 'audio' | 'text' | 'archive'

export type ArtifactFetchErrorCode =
  | 'ARTIFACT_URL_REJECTED'
  | 'HOST_REJECTED'
  | 'REDIRECT_REJECTED'
  | 'FETCH_FAILED'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'MIME_REJECTED'

export type ArtifactFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface FetchProviderArtifactInput {
  url: string | URL
  kind: ProviderArtifactKind
  allowedHosts?: readonly string[]
  maxBytes: number
  timeoutMs?: number
  maxRedirects?: number
  signal?: AbortSignal
  fetch?: ArtifactFetch
}

export interface VerifiedArtifactResponse {
  finalUrl: string
  contentType: string
  contentLength?: number
  body: ReadableStream<Uint8Array>
  consume(): Promise<Uint8Array>
}

const ERROR_MESSAGES: Record<ArtifactFetchErrorCode, string> = {
  ARTIFACT_URL_REJECTED: 'Provider artifact URL rejected',
  HOST_REJECTED: 'Provider artifact host rejected',
  REDIRECT_REJECTED: 'Provider artifact redirect rejected',
  FETCH_FAILED: 'Provider artifact fetch failed',
  TIMEOUT: 'Provider artifact fetch timed out',
  TOO_LARGE: 'Provider artifact exceeds the byte limit',
  MIME_REJECTED: 'Provider artifact MIME type rejected',
}

export class ArtifactFetchError extends Error {
  readonly code: ArtifactFetchErrorCode

  constructor(code: ArtifactFetchErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'ArtifactFetchError'
    this.code = code
  }
}

const MIME_ALLOWLIST: Record<ProviderArtifactKind, readonly string[]> = {
  image: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/webm'],
  text: ['text/plain', 'text/markdown', 'text/csv', 'application/json'],
  archive: ['application/zip', 'application/gzip', 'application/x-gzip', 'application/x-tar', 'application/octet-stream'],
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const BLOCKED_LOCAL_NAMES = ['localhost', 'local', 'internal', 'lan', 'home.arpa'] as const
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_REDIRECTS = 3

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, '')
}

function isValidDnsHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false
  const labels = hostname.split('.')
  return labels.length >= 2 && labels.every(label => DNS_LABEL.test(label))
}

function isIpLiteral(hostname: string): boolean {
  const candidate = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  return isIP(candidate) !== 0
}

function isBlockedLocalName(hostname: string): boolean {
  if (!hostname.includes('.')) return true
  return BLOCKED_LOCAL_NAMES.some(name => hostname === name || hostname.endsWith(`.${name}`))
}

function isDashScopeResultHost(hostname: string): boolean {
  const labels = hostname.split('.')
  if (labels.length !== 4 || labels[2] !== 'aliyuncs' || labels[3] !== 'com') return false
  const resultLabel = labels[0]
  const ossLabel = labels[1]
  if (resultLabel === undefined || ossLabel === undefined) return false
  // DashScope 目前会同时返回 legacy 的 `dashscope-result-*` 与直接的
  // `dashscope-*` OSS 加速结果域名。保留 provider 专属前缀与 DNS 结构校验，
  // 绝不接受任意的 aliyuncs.com 域名。
  const resultPrefix = resultLabel.startsWith('dashscope-result-')
    ? 'dashscope-result-'
    : resultLabel.startsWith('dashscope-')
      ? 'dashscope-'
      : undefined
  if (resultPrefix === undefined || !DNS_LABEL.test(resultLabel)) return false
  if (!ossLabel.startsWith('oss-') || !DNS_LABEL.test(ossLabel)) return false
  return DNS_LABEL.test(resultLabel.slice(resultPrefix.length))
}

function configuredHosts(values: readonly string[] | undefined): ReadonlySet<string> {
  const hosts = new Set<string>()
  for (const value of values ?? []) {
    const normalized = normalizeHostname(value)
    if (isValidDnsHostname(normalized)) hosts.add(normalized)
  }
  return hosts
}

/**
 * SSRF 防护：校验协议、凭据、端口与主机名，只允许显式白名单域名或
 * DashScope 专属结果域名，拒绝 IP 字面量与本地/内网主机名。
 */
function validateUrl(value: string | URL, allowedHosts: ReadonlySet<string>): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ArtifactFetchError('ARTIFACT_URL_REJECTED')
  }

  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0 || (url.port.length > 0 && url.port !== '443')) {
    throw new ArtifactFetchError('ARTIFACT_URL_REJECTED')
  }

  const hostname = normalizeHostname(url.hostname)
  if (isIpLiteral(hostname) || isBlockedLocalName(hostname) || !isValidDnsHostname(hostname)) {
    throw new ArtifactFetchError('HOST_REJECTED')
  }
  if (!allowedHosts.has(hostname) && !isDashScopeResultHost(hostname)) {
    throw new ArtifactFetchError('HOST_REJECTED')
  }

  url.hostname = hostname
  url.hash = ''
  return url
}

interface FetchLifecycle {
  readonly signal: AbortSignal
  readonly timedOut: boolean
  abort(): void
  dispose(): void
}

function createFetchLifecycle(timeoutMs: number, externalSignal: AbortSignal | undefined): FetchLifecycle {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    externalSignal?.removeEventListener('abort', externalAbort)
  }
  const externalAbort = () => {
    controller.abort()
    dispose()
  }

  if (externalSignal?.aborted) {
    controller.abort()
    disposed = true
  } else {
    externalSignal?.addEventListener('abort', externalAbort, { once: true })
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    get timedOut() { return timedOut },
    abort() {
      controller.abort()
      dispose()
    },
    dispose,
  }
}

function mapFetchError(error: unknown, lifecycle: FetchLifecycle): ArtifactFetchError {
  if (lifecycle.timedOut) return new ArtifactFetchError('TIMEOUT')
  if (error instanceof ArtifactFetchError) return error
  return new ArtifactFetchError('FETCH_FAILED')
}

function responseContentType(response: Response, kind: ProviderArtifactKind): string {
  const value = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (value === undefined || !MIME_ALLOWLIST[kind].includes(value)) {
    throw new ArtifactFetchError('MIME_REJECTED')
  }
  return value
}

function responseContentLength(response: Response, maxBytes: number): number | undefined {
  const raw = response.headers.get('content-length')
  if (raw === null) return undefined
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw.trim())) throw new ArtifactFetchError('FETCH_FAILED')
  const length = BigInt(raw.trim())
  if (length > BigInt(maxBytes)) throw new ArtifactFetchError('TOO_LARGE')
  return Number(length)
}

function boundedBody(source: ReadableStream<Uint8Array>, maxBytes: number, lifecycle: FetchLifecycle): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let bytes = 0
  let closed = false

  const fail = (controller: ReadableStreamDefaultController<Uint8Array>, error: ArtifactFetchError) => {
    if (closed) return
    closed = true
    lifecycle.abort()
    void reader.cancel().catch(() => undefined)
    controller.error(error)
  }

  return new ReadableStream({
    async pull(controller) {
      if (closed) return
      try {
        const chunk = await reader.read()
        if (lifecycle.timedOut) {
          fail(controller, new ArtifactFetchError('TIMEOUT'))
          return
        }
        if (chunk.done) {
          closed = true
          lifecycle.dispose()
          controller.close()
          return
        }
        bytes += chunk.value.byteLength
        if (bytes > maxBytes) {
          fail(controller, new ArtifactFetchError('TOO_LARGE'))
          return
        }
        controller.enqueue(chunk.value)
      } catch (error) {
        fail(controller, mapFetchError(error, lifecycle))
      }
    },
    async cancel(reason) {
      if (closed) return
      closed = true
      lifecycle.abort()
      await reader.cancel(reason).catch(() => undefined)
    },
  })
}

async function consumeBody(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      chunks.push(chunk.value)
      size += chunk.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function validPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function inlineDataArtifact(
  value: string,
  kind: ProviderArtifactKind,
  maxBytes: number,
): VerifiedArtifactResponse {
  const comma = value.indexOf(',')
  if (!value.startsWith('data:') || comma < 6) throw new ArtifactFetchError('ARTIFACT_URL_REJECTED')
  const metadata = value.slice(5, comma).split(';')
  const contentType = (metadata[0] ?? 'text/plain').trim().toLowerCase()
  if (!MIME_ALLOWLIST[kind].includes(contentType)) throw new ArtifactFetchError('MIME_REJECTED')

  const encoded = value.slice(comma + 1)
  let bytes: Uint8Array
  try {
    bytes = metadata.includes('base64')
      ? Uint8Array.from(Buffer.from(encoded, 'base64'))
      : new TextEncoder().encode(decodeURIComponent(encoded))
  } catch {
    throw new ArtifactFetchError('FETCH_FAILED')
  }
  if (bytes.byteLength > maxBytes) throw new ArtifactFetchError('TOO_LARGE')

  let emitted = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted) return
      emitted = true
      controller.enqueue(bytes)
      controller.close()
    },
  })
  let consumed = false
  return {
    finalUrl: `data:${contentType}`,
    contentType,
    contentLength: bytes.byteLength,
    body,
    consume() {
      if (consumed) return Promise.reject(new ArtifactFetchError('FETCH_FAILED'))
      consumed = true
      return consumeBody(body)
    },
  }
}

export async function fetchProviderArtifact(input: FetchProviderArtifactInput): Promise<VerifiedArtifactResponse> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = input.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  if (!validPositiveSafeInteger(input.maxBytes) || !validPositiveSafeInteger(timeoutMs) || !Number.isSafeInteger(maxRedirects) || maxRedirects < 0) {
    throw new ArtifactFetchError('FETCH_FAILED')
  }

  if (typeof input.url === 'string' && input.url.startsWith('data:')) {
    return inlineDataArtifact(input.url, input.kind, input.maxBytes)
  }

  const allowedHosts = configuredHosts(input.allowedHosts)
  let current = validateUrl(input.url, allowedHosts)
  const lifecycle = createFetchLifecycle(timeoutMs, input.signal)
  const fetchImpl = input.fetch ?? globalThis.fetch
  let redirects = 0

  try {
    while (true) {
      const response = await fetchImpl(current, {
        method: 'GET',
        headers: { accept: MIME_ALLOWLIST[input.kind].join(', ') },
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: lifecycle.signal,
      })

      if (REDIRECT_STATUSES.has(response.status)) {
        void response.body?.cancel().catch(() => undefined)
        const location = response.headers.get('location')
        if (location === null || redirects >= maxRedirects) throw new ArtifactFetchError('REDIRECT_REJECTED')
        try {
          current = validateUrl(new URL(location, current), allowedHosts)
        } catch {
          throw new ArtifactFetchError('REDIRECT_REJECTED')
        }
        redirects += 1
        continue
      }

      if (!response.ok || response.body === null) throw new ArtifactFetchError('FETCH_FAILED')
      const contentType = responseContentType(response, input.kind)
      const contentLength = responseContentLength(response, input.maxBytes)
      const body = boundedBody(response.body, input.maxBytes, lifecycle)
      let consumed = false
      return {
        finalUrl: current.toString(),
        contentType,
        ...(contentLength === undefined ? {} : { contentLength }),
        body,
        consume() {
          if (consumed) return Promise.reject(new ArtifactFetchError('FETCH_FAILED'))
          consumed = true
          return consumeBody(body)
        },
      }
    }
  } catch (error) {
    lifecycle.abort()
    throw mapFetchError(error, lifecycle)
  }
}
