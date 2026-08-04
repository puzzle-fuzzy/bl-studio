import { describe, expect, it } from 'vitest'
import { readRequestGuardConfig, validateCsrfOrigin, validateRequestGuards } from '../src/lib/request-guards'

describe('request guards', () => {
  it('uses separate JSON and multipart body limits', () => {
    const config = readRequestGuardConfig({
      API_MAX_JSON_BODY_BYTES: '100',
      API_MAX_MULTIPART_BODY_BYTES: '200',
      API_MAX_OTHER_BODY_BYTES: '300',
    })

    expect(validateRequestGuards(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '101' },
    }), config)?.code).toBe('REQUEST_TOO_LARGE')
    expect(validateRequestGuards(new Request('http://localhost/api/assets/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test', 'content-length': '200' },
    }), config)).toBeUndefined()
  })

  it('accepts an allowed origin and rejects an untrusted origin', () => {
    const allowed = ['https://forge.example.com']
    expect(validateCsrfOrigin(new Request('https://api.example.com', {
      method: 'POST',
      headers: { origin: 'https://forge.example.com' },
    }), allowed, true)).toBeUndefined()
    expect(validateCsrfOrigin(new Request('https://api.example.com', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    }), allowed, true)?.code).toBe('CSRF_ORIGIN_INVALID')
  })

  it('can require a source header in production while preserving non-browser clients locally', () => {
    const request = new Request('https://api.example.com', { method: 'POST' })
    expect(validateCsrfOrigin(request, ['https://forge.example.com'], false)).toBeUndefined()
    expect(validateCsrfOrigin(request, ['https://forge.example.com'], true)?.code).toBe('CSRF_ORIGIN_INVALID')
  })
})
