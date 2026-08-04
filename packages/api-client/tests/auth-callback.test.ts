import { describe, expect, it } from 'vitest'
import { buildLoginUrl, isAllowedCallback, resolvePostLoginRedirect } from '../src/auth-callback'

const allowed = ['http://localhost:5002']

describe('auth callback helpers', () => {
  it('allows same-origin relative paths', () => {
    expect(isAllowedCallback('/dashboard', allowed)).toBe(true)
    expect(isAllowedCallback('//evil.example.com', allowed)).toBe(false)
  })

  it('rejects callbacks containing backslashes', () => {
    expect(isAllowedCallback('/\\evil.com', allowed)).toBe(false)
    expect(isAllowedCallback('\\evil.com', allowed)).toBe(false)
  })

  it('allows only whitelisted absolute origins', () => {
    expect(isAllowedCallback('http://localhost:5002/generations', allowed)).toBe(true)
    expect(isAllowedCallback('https://evil.example.com/files', allowed)).toBe(false)
  })

  it('builds web login URL with callback parameter', () => {
    const url = buildLoginUrl('http://localhost:5002/generations', {
      webOrigin: 'http://localhost:5002',
      allowedCallbackOrigins: allowed,
    })
    expect(url).toBe('http://localhost:5002/login?cb=http%3A%2F%2Flocalhost%3A5002%2Fgenerations')
  })

  it('falls back when callback is not allowed', () => {
    expect(resolvePostLoginRedirect('https://evil.example.com', '/', allowed)).toBe('/')
    expect(resolvePostLoginRedirect('http://localhost:5002/generations', '/', allowed)).toBe('http://localhost:5002/generations')
  })
})
