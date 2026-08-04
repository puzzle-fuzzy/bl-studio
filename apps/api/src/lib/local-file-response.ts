import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export class LocalFileTooLargeError extends Error {
  readonly code = 'ARTIFACT_TOO_LARGE'

  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(`Local artifact is ${bytes} bytes, exceeding the ${limit}-byte response limit`)
    this.name = 'LocalFileTooLargeError'
  }
}

/**
 * Open a bounded local file response without buffering the entire object in
 * the API process. The stat check prevents an unbounded file from being
 * exposed; the stream keeps normal large responses off the heap.
 */
export async function createLocalFileResponse(input: {
  path: string
  maxBytes: number
  contentType: string
  cacheControl: string
  contentDisposition?: string
}): Promise<Response> {
  const metadata = await stat(input.path)
  if (!metadata.isFile()) {
    const error = new Error('Local artifact path is not a regular file')
    error.name = 'LocalArtifactNotFileError'
    throw error
  }
  if (metadata.size > input.maxBytes) {
    throw new LocalFileTooLargeError(metadata.size, input.maxBytes)
  }

  const stream = createReadStream(input.path)
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'content-type': input.contentType,
      'content-length': String(metadata.size),
      'cache-control': input.cacheControl,
      ...(input.contentDisposition !== undefined
        ? { 'content-disposition': input.contentDisposition }
        : {}),
    },
  })
}
