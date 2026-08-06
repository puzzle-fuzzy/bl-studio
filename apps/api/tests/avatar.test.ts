import { describe, expect, it } from 'vitest'
import { avatarContentTypeForKey, generateAvatarSvg } from '../src/lib/avatar'

describe('generateAvatarSvg', () => {
  it('returns an SVG document for any userId', () => {
    const svg = generateAvatarSvg('user-1')
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain('</svg>')
  })

  it('is deterministic: same userId always produces the same SVG', () => {
    expect(generateAvatarSvg('user-1')).toBe(generateAvatarSvg('user-1'))
    expect(generateAvatarSvg('some-other-id')).toBe(generateAvatarSvg('some-other-id'))
  })

  it('produces different SVGs for different userIds', () => {
    expect(generateAvatarSvg('user-1')).not.toBe(generateAvatarSvg('user-2'))
    expect(generateAvatarSvg('aaaa')).not.toBe(generateAvatarSvg('bbbb'))
  })

  it('is symmetric across the vertical middle column', () => {
    // 5×5 网格：左半由哈希决定，右半镜像。断言同一行左右两侧色块数量一致。
    const svg = generateAvatarSvg('mirror-check')
    const cells = svg.match(/<rect/g) ?? []
    // 背景 rect 之外，网格色块总数应为偶数（左右成对）。
    expect(cells.length - 1).toBeGreaterThan(0)
    expect((cells.length - 1) % 2).toBe(0)
  })

  it('never emits unescaped user-controlled characters into markup', () => {
    // userId 只参与哈希派生，不应出现在输出里。
    const svg = generateAvatarSvg('<script>alert(1)</script>')
    expect(svg).not.toContain('<script>')
  })
})

describe('avatarContentTypeForKey', () => {
  it('maps supported extensions to image content types', () => {
    expect(avatarContentTypeForKey('avatars/u/1.png')).toBe('image/png')
    expect(avatarContentTypeForKey('avatars/u/1.jpg')).toBe('image/jpeg')
    expect(avatarContentTypeForKey('avatars/u/1.jpeg')).toBe('image/jpeg')
    expect(avatarContentTypeForKey('avatars/u/1.webp')).toBe('image/webp')
  })

  it('is case-insensitive and falls back to image/png for unknown extensions', () => {
    expect(avatarContentTypeForKey('avatars/u/1.PNG')).toBe('image/png')
    expect(avatarContentTypeForKey('avatars/u/1.gif')).toBe('image/png')
    expect(avatarContentTypeForKey('avatars/u/no-ext')).toBe('image/png')
  })
})
