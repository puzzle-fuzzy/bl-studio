import { describe, expect, it } from 'vitest'
import {
  createSmtpEmailSender,
  type MailTransport,
  type MailTransportFactory,
} from '../src/modules/auth/smtp-email-sender'

describe('163 SMTP email sender', () => {
  it('uses the authorization-code transport and sends text plus escaped HTML', async () => {
    const transports: unknown[] = []
    const messages: Array<Record<string, string>> = []
    const transport: MailTransport = {
      async sendMail(input) {
        messages.push(input)
      },
    }
    const createTransport: MailTransportFactory = options => {
      transports.push(options)
      return transport
    }
    const sender = createSmtpEmailSender({
      SMTP_HOST: 'smtp.163.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'forge@163.com',
      SMTP_PASS: 'client-authorization-code',
      SMTP_FROM: 'Bailian Studio <forge@163.com>',
    }, createTransport)

    await sender.sendEmailVerification({
      to: 'user@example.test',
      verifyUrl: 'https://create.example.test/auth/verify-email#token=a&b',
      expiresAt: '2026-07-26T00:00:00.000Z',
    })
    await sender.sendPasswordReset({
      to: 'user@example.test',
      resetUrl: 'https://create.example.test/auth/reset-password#token=<secret>',
      expiresAt: '2026-07-25T00:30:00.000Z',
    })

    expect(transports).toEqual([{
      host: 'smtp.163.com',
      port: 465,
      secure: true,
      auth: { user: 'forge@163.com', pass: 'client-authorization-code' },
    }])
    expect(messages).toHaveLength(2)
    expect(messages[0]?.text).toContain('#token=a&b')
    expect(messages[0]?.html).toContain('#token=a&amp;b')
    expect(messages[1]?.text).toContain('#token=<secret>')
    expect(messages[1]?.html).toContain('#token=&lt;secret&gt;')
  })

  it('reports unavailable delivery without exposing configuration values', async () => {
    const sender = createSmtpEmailSender({})
    await expect(sender.sendEmailVerification({
      to: 'user@example.test',
      verifyUrl: 'https://create.example.test/auth/verify-email#token=secret',
      expiresAt: '2026-07-26T00:00:00.000Z',
    })).rejects.toThrow('Transactional email is unavailable')
  })

  it('supports an explicit loopback Mailpit transport without SMTP credentials in development', async () => {
    const transports: unknown[] = []
    const transport: MailTransport = { async sendMail() {} }
    const createTransport: MailTransportFactory = options => {
      transports.push(options)
      return transport
    }
    const sender = createSmtpEmailSender({
      NODE_ENV: 'development',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
    }, createTransport)

    await sender.sendEmailVerification({
      to: 'user@example.test',
      verifyUrl: 'http://localhost:5004/auth/verify-email#token=secret',
      expiresAt: '2026-07-26T00:00:00.000Z',
    })

    expect(transports).toEqual([{
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    }])
  })
})
