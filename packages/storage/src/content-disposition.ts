const MAX_DOWNLOAD_FILE_NAME_CODE_POINTS = 180
// biome-ignore lint/suspicious/noControlCharactersInRegex: HTTP header sanitization must remove control and bidi characters.
const UNSAFE_HEADER_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g
const MIME_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/gzip': '.gz',
  'application/json': '.json',
  'application/octet-stream': '.bin',
  'application/x-gzip': '.gz',
  'application/x-tar': '.tar',
  'application/zip': '.zip',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/mp3': '.mp3',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-flac': '.flac',
  'audio/x-wav': '.wav',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'text/plain': '.txt',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
}

/**
 * 解析面向用户的下载文件名，不退回使用内部 storage key。
 * 存储名与 asset id 一律视为不可信输入。
 */
export function assetDownloadFileName(
  fileName: string | undefined,
  assetId: string,
  mimeType?: string,
): string {
  const storedName = sanitizeFileName(fileName ?? '')
  if (hasUsableFileName(storedName)) return storedName

  const safeAssetId = sanitizeFileName(assetId)
  const fallback = hasUsableFileName(safeAssetId) ? `asset-${safeAssetId}` : 'asset-download'
  return appendMimeTypeExtension(fallback, mimeType)
}

/**
 * 构造 attachment 的 Content-Disposition 值：含 ASCII 兼容回退与 RFC 5987
 * UTF-8 文件名。任何原始控制字符、引号、反斜杠或路径分隔符都不允许进入
 * 该 header 值。
 */
export function attachmentContentDisposition(fileName: string): string {
  const sanitizedFileName = sanitizeFileName(fileName)
  const safeFileName = hasUsableFileName(sanitizedFileName) ? sanitizedFileName : 'download'
  const asciiFallback = asciiFileNameFallback(safeFileName)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeFileName)}`
}

function hasUsableFileName(value: string): boolean {
  const stem = value.replace(/\.[\p{L}\p{N}]{1,10}$/u, '')
  return /[\p{L}\p{N}]/u.test(stem)
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(UNSAFE_HEADER_CHARACTERS, '_')
    .replace(/[\\/]/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return Array.from(normalized).slice(0, MAX_DOWNLOAD_FILE_NAME_CODE_POINTS).join('')
}

function appendMimeTypeExtension(fileName: string, mimeType: string | undefined): string {
  const normalizedMimeType = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  if (normalizedMimeType === undefined || normalizedMimeType.length === 0) return fileName

  const extension = MIME_TYPE_EXTENSIONS[normalizedMimeType]
  if (extension === undefined || fileName.toLowerCase().endsWith(extension)) return fileName
  return `${fileName}${extension}`
}

function asciiFileNameFallback(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
  const extension = normalized.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] ?? ''
  const fallback = normalized
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)

  if (fallback.length > 0 && fallback !== extension.slice(1)) return fallback
  return `download${extension}`
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}
