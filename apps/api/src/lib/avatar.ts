import { createHash } from 'node:crypto'

/**
 * GitHub 风 identicon 默认头像生成。
 *
 * 纯函数：同一个 userId 永远生成同一张 SVG（确定性、可缓存），不同 userId
 * 得到不同配色与图案。刻意做成无状态 —— 注册时不需要落库任何头像数据，
 * `GET /api/avatars/:userId` 在用户未上传自定义头像时现算即回。
 *
 * 图案为 5×5 对称网格（左半派生自哈希、右半镜像），单色相的 5 档明度填充。
 */

const GRID = 5
/** 网格左半（含中轴）的列数，右半镜像补齐。 */
const HALF = Math.ceil(GRID / 2)

/** 画布逻辑尺寸（viewBox 单位），由 CSS 决定实际像素大小。 */
const CANVAS = 100
const CELL = CANVAS / GRID

function hueFromSeed(digest: Uint8Array): number {
  // 用两个字节派生色相，避免低字节相关性导致的相邻用户配色雷同。
  return ((digest[0]! << 8) | digest[1]!) % 360
}

/** 同一色相的 5 档明度，供网格填充产生立体感（仍是单色系，符合 identicon 直觉）。 */
function cellShades(hue: number): string[] {
  const saturation = 68
  return [48, 41, 34, 27, 21].map(lightness => `hsl(${hue} ${saturation}% ${lightness}%)`)
}

function cellIsSet(digest: Uint8Array, row: number, col: number): boolean {
  // 派生稳定但不显式的位索引：与行/列线性组合，避免简单逐字节产生的规律图案。
  const index = 1 + row * HALF + col
  const byte = digest[index % digest.length]!
  return ((byte >> (index % 8)) & 1) === 1
}

/** 生成用户默认头像的 SVG 字符串（image/svg+xml）。 */
export function generateAvatarSvg(userId: string): string {
  const digest = new Uint8Array(createHash('sha256').update(userId, 'utf8').digest())
  const hue = hueFromSeed(digest)
  const shades = cellShades(hue)

  const background = `hsl(${hue} ${68}% ${95}%)`
  const cells: string[] = []

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < HALF; col++) {
      if (!cellIsSet(digest, row, col)) continue
      // 对称：右半列镜像（col' = GRID-1-col）；同对格子用同一档明度，视觉平衡。
      const fill = shades[(row + col) % shades.length]
      const left = `<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" rx="${CELL * 0.2}" fill="${fill}"/>`
      const mirroredCol = GRID - 1 - col
      const right = mirroredCol === col
        ? left
        : `<rect x="${mirroredCol * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" rx="${CELL * 0.2}" fill="${fill}"/>`
      cells.push(left, right)
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">`
    + `<rect width="${CANVAS}" height="${CANVAS}" rx="${CANVAS * 0.22}" fill="${background}"/>`
    + cells.join('')
    + `</svg>`
  )
}

const AVATAR_CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/** 按存储 key 扩展名推断头像的 content-type；未知扩展回退 image/png。 */
export function avatarContentTypeForKey(storageKey: string): string {
  const lower = storageKey.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot === -1 ? '' : lower.slice(dot)
  return AVATAR_CONTENT_TYPE[ext] ?? 'image/png'
}
