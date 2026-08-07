/**
 * 文件魔数校验（P1-16）：用首字节特征核对客户端声明的 MIME 类型。
 *
 * 只读取文件前 64 字节，不做全量载入；校验失败抛 ValidationError（→ 400）。
 * 无可靠统一签名的文本类型（text/plain、application/json）不参与字节校验。
 */
import { ValidationError } from '@bailian-studio/shared'

/** 嗅探读取的字节数：所有目标格式的签名都落在前 12 字节内，64 留足余量。 */
const SNIFF_BYTES = 64

type Sniffer = (head: Uint8Array) => boolean

function hasPrefix(head: Uint8Array, bytes: readonly number[]): boolean {
  if (head.byteLength < bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (head[i] !== bytes[i]) return false
  }
  return true
}

function asciiAt(head: Uint8Array, offset: number, expected: string): boolean {
  if (head.byteLength < offset + expected.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (head[offset + i] !== expected.charCodeAt(i)) return false
  }
  return true
}

/** MP3：ID3v2 标签，或 MPEG 帧同步（0xFF Ex 且第二字节高 3 位全 1）。 */
function isMp3(head: Uint8Array): boolean {
  if (asciiAt(head, 0, 'ID3')) return true
  return head.byteLength >= 2 && head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0
}

/** ISO-BMFF 家族（MP4/M4A）：偏移 4 处的 'ftyp' box 标识。 */
function isFtyp(head: Uint8Array): boolean {
  return asciiAt(head, 4, 'ftyp')
}

/**
 * 各允许 MIME 的首字节签名。只收录 assets/avatar 白名单里的媒体类型；
 * 未被收录的类型（text/plain、application/json）直接放行。
 */
const MIME_SNIFFERS: Readonly<Record<string, Sniffer>> = {
  'image/png': head => hasPrefix(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': head => hasPrefix(head, [0xff, 0xd8, 0xff]),
  'image/webp': head => head.byteLength >= 12 && asciiAt(head, 0, 'RIFF') && asciiAt(head, 8, 'WEBP'),
  'audio/wav': head => head.byteLength >= 12 && asciiAt(head, 0, 'RIFF') && asciiAt(head, 8, 'WAVE'),
  'audio/mpeg': isMp3,
  'audio/ogg': head => asciiAt(head, 0, 'OggS'),
  'audio/mp4': isFtyp,
  'video/mp4': isFtyp,
  'video/webm': head => hasPrefix(head, [0x1a, 0x45, 0xdf, 0xa3]),
}

/**
 * 校验文件内容与声明的 MIME 是否一致。媒体类型必须命中签名；
 * 否则视为客户端伪装类型并拒绝。
 */
export async function assertFileMatchesMime(file: File): Promise<void> {
  const sniffer = MIME_SNIFFERS[file.type]
  if (sniffer === undefined) return
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
  if (!sniffer(head)) {
    throw new ValidationError(`文件内容与声明的类型不符：${file.type}`, 'file')
  }
}
