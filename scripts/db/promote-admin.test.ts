import { describe, expect, it } from 'vitest'
import { parsePromoteAdminArgs } from './promote-admin'

describe('parsePromoteAdminArgs', () => {
  it('requires explicit confirmation and exactly one selector', () => {
    expect(() => parsePromoteAdminArgs(['--email=owner@example.com'])).toThrow('--confirm')
    expect(() => parsePromoteAdminArgs(['--confirm'])).toThrow('exactly one selector')
    expect(() => parsePromoteAdminArgs(['--email=a@example.com', '--user-id=u1', '--confirm'])).toThrow('exactly one selector')
  })

  it('accepts an email selector', () => {
    expect(parsePromoteAdminArgs(['--email=owner@example.com', '--confirm'])).toEqual({
      email: 'owner@example.com',
      confirmed: true,
    })
  })

  it('accepts a user id selector', () => {
    expect(parsePromoteAdminArgs(['--user-id=user_123', '--confirm'])).toEqual({
      userId: 'user_123',
      confirmed: true,
    })
  })
})
