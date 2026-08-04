import { describe, expect, it } from 'vitest'
import { assetDownloadFileName, attachmentContentDisposition } from '../src'

describe('download content disposition', () => {
  it('emits a conservative ASCII fallback and an encoded UTF-8 filename', () => {
    expect(attachmentContentDisposition('报告 2026.png')).toBe(
      `attachment; filename="2026.png"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026.png`,
    )
  })

  it('removes header injection and path separators from untrusted filenames', () => {
    const fileName = assetDownloadFileName('../报告\r\nX-Evil: injected.png', 'asset_1')
    const header = attachmentContentDisposition(fileName)

    expect(fileName).toBe('_报告_X-Evil: injected.png')
    expect(header).not.toContain('\r')
    expect(header).not.toContain('\n')
    expect(header).not.toContain('../')
    expect(header).toContain('filename="X-Evil_injected.png"')
    expect(header).toContain(`filename*=UTF-8''_`)
  })

  it('uses a sanitized asset id when the stored filename is absent', () => {
    expect(assetDownloadFileName(undefined, 'asset/unsafe\r\n42')).toBe('asset-asset_unsafe_42')
  })

  it('adds a safe extension from a known MIME type only when the stored filename is absent', () => {
    expect(assetDownloadFileName(undefined, 'generated_image_1', 'image/png')).toBe(
      'asset-generated_image_1.png',
    )
    expect(assetDownloadFileName(undefined, 'generated_video_1', 'VIDEO/MP4; charset=binary')).toBe(
      'asset-generated_video_1.mp4',
    )
    expect(assetDownloadFileName(undefined, 'generated_audio_1', 'audio/mpeg')).toBe(
      'asset-generated_audio_1.mp3',
    )
    expect(assetDownloadFileName(undefined, 'generated_audio_1.mp3', 'audio/mpeg')).toBe(
      'asset-generated_audio_1.mp3',
    )
    expect(assetDownloadFileName(undefined, 'generated_unknown_1', 'application/x-custom')).toBe(
      'asset-generated_unknown_1',
    )
    expect(assetDownloadFileName('stored-name', 'generated_image_1', 'image/png')).toBe('stored-name')
  })

  it('covers every MIME type accepted for persisted provider artifacts', () => {
    const cases = [
      ['image/png', '.png'],
      ['image/jpeg', '.jpg'],
      ['image/jpg', '.jpg'],
      ['image/webp', '.webp'],
      ['image/gif', '.gif'],
      ['image/avif', '.avif'],
      ['video/mp4', '.mp4'],
      ['video/webm', '.webm'],
      ['video/quicktime', '.mov'],
      ['video/x-matroska', '.mkv'],
      ['audio/mpeg', '.mp3'],
      ['audio/mp3', '.mp3'],
      ['audio/wav', '.wav'],
      ['audio/x-wav', '.wav'],
      ['audio/flac', '.flac'],
      ['audio/x-flac', '.flac'],
      ['audio/ogg', '.ogg'],
      ['audio/mp4', '.m4a'],
      ['audio/aac', '.aac'],
      ['audio/webm', '.webm'],
      ['text/plain', '.txt'],
      ['text/markdown', '.md'],
      ['text/csv', '.csv'],
      ['application/json', '.json'],
      ['application/zip', '.zip'],
      ['application/gzip', '.gz'],
      ['application/x-gzip', '.gz'],
      ['application/x-tar', '.tar'],
      ['application/octet-stream', '.bin'],
    ] as const

    for (const [mimeType, extension] of cases) {
      expect(assetDownloadFileName(undefined, 'generated_asset', mimeType), mimeType).toBe(
        `asset-generated_asset${extension}`,
      )
    }
  })

  it('removes every Bidi_Control character and paragraph separator', () => {
    const controls = [
      ['ARABIC LETTER MARK', '\u061C'],
      ['LEFT-TO-RIGHT MARK', '\u200E'],
      ['RIGHT-TO-LEFT MARK', '\u200F'],
      ['LINE SEPARATOR', '\u2028'],
      ['PARAGRAPH SEPARATOR', '\u2029'],
      ['LEFT-TO-RIGHT EMBEDDING', '\u202A'],
      ['RIGHT-TO-LEFT EMBEDDING', '\u202B'],
      ['POP DIRECTIONAL FORMATTING', '\u202C'],
      ['LEFT-TO-RIGHT OVERRIDE', '\u202D'],
      ['RIGHT-TO-LEFT OVERRIDE', '\u202E'],
      ['LEFT-TO-RIGHT ISOLATE', '\u2066'],
      ['RIGHT-TO-LEFT ISOLATE', '\u2067'],
      ['FIRST STRONG ISOLATE', '\u2068'],
      ['POP DIRECTIONAL ISOLATE', '\u2069'],
    ] as const

    for (const [name, control] of controls) {
      const fileName = assetDownloadFileName(`report${control}final.txt`, 'asset_1')
      const header = attachmentContentDisposition(fileName)
      expect(fileName, name).toBe('report_final.txt')
      expect(header, name).not.toContain(control)
    }
  })

  it('falls back to the asset id when the stored filename has no usable characters', () => {
    const unusableNames = [
      '\r\n',
      '/\\',
      '___',
      '...',
      '---',
      '!@#$%^&*()',
      '\u061C\u200E\u200F',
    ] as const

    for (const storedName of unusableNames) {
      expect(assetDownloadFileName(storedName, 'asset/unsafe\r\n42'), storedName).toBe(
        'asset-asset_unsafe_42',
      )
    }
  })
})
