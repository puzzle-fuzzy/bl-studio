import { extname } from 'node:path'

/**
 * 按文件扩展名推断 Content-Type。gallery / admin / artifacts 流式读取共用，
 * 避免各处维护重复映射。
 */
export function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.mp4': return 'video/mp4'
    case '.mp3':
    case '.mpeg': return 'audio/mpeg'
    case '.txt': return 'text/plain; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    default: return 'application/octet-stream'
  }
}
