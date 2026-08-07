import { describe, expect, it } from 'vitest'
import { readCookie } from '../src/modules/auth/cookies'

describe('session cookie parsing', () => {
  it('returns the decoded value for a well-formed cookie', () => {
    expect(readCookie('a=1; bailian_studio_session=abc%2Ddef; other=x', 'bailian_studio_session')).toBe('abc-def')
  })

  it('treats an empty value as absent', () => {
    expect(readCookie('bailian_studio_session=; other=x', 'bailian_studio_session')).toBeUndefined()
  })

  // P1-20：畸形转义（%zz）不得抛 URIError 把请求打成 500，应按「无此 cookie」回落。
  it('swallows a malformed URI escape and treats the cookie as absent', () => {
    expect(() => readCookie('bailian_studio_session=abc%zzxyz; other=x', 'bailian_studio_session')).not.toThrow()
    expect(readCookie('bailian_studio_session=abc%zzxyz; other=x', 'bailian_studio_session')).toBeUndefined()
  })

  it('only matches the exact cookie name', () => {
    expect(readCookie('bailian_studio_session_pending=1; bailian_studio_session=real', 'bailian_studio_session')).toBe('real')
  })
})
