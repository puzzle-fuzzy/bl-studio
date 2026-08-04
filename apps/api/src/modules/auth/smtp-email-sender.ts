import nodemailer from 'nodemailer'
import type { TransactionalEmailSender } from '@bailian-studio/auth'
import { createLogger } from '@bailian-studio/shared'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

const mailLogger = createLogger('mail')

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
}

export interface MailTransport {
  sendMail(input: {
    from: string
    to: string
    subject: string
    text: string
    html: string
  }): Promise<unknown>
}

export type MailTransportFactory = (options: {
  host: string
  port: number
  secure: boolean
  auth?: { user: string; pass: string }
}) => MailTransport

/**
 * 创建兼容 163 的事务邮件适配器。
 *
 * 配置懒加载，因此在未配置 SMTP 前本地 API 也能正常启动。任何发送失败都不会
 * 打印凭据、收件人或完整动作 URL。
 */
export function createSmtpEmailSender(
  source: EnvironmentSource = process.env,
  createTransport: MailTransportFactory = nodemailer.createTransport,
): TransactionalEmailSender {
  let transport: MailTransport | undefined

  function getTransport() {
    const config = readSmtpConfig(source)
    transport ??= createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user !== undefined && config.pass !== undefined
        ? { auth: { user: config.user, pass: config.pass } }
        : {}),
    })
    return { transport, config }
  }

  return {
    async sendEmailVerification(input) {
      const { transport: sender, config } = getTransport()
      const verifyUrl = escapeHtml(input.verifyUrl)
      const expiresAt = escapeHtml(input.expiresAt)
      try {
        await sender.sendMail({
          from: config.from,
          to: input.to,
          subject: '验证你的 Bailian Studio 邮箱',
          text: `请打开以下链接完成邮箱验证：\n${input.verifyUrl}\n\n链接有效期至：${input.expiresAt}`,
          html: `<p>请点击下面的链接完成邮箱验证：</p><p><a href="${verifyUrl}">验证邮箱</a></p><p>链接有效期至：${expiresAt}</p>`,
        })
        mailLogger.info('email.sent', { to: input.to, purpose: 'verify_email' })
      } catch (error) {
        // 只记收件人与用途，绝不记录凭据或完整 action URL。
        mailLogger.error('email.send_failed', {
          to: input.to,
          purpose: 'verify_email',
          errorName: error instanceof Error ? error.name : 'unknown',
        })
        throw error
      }
    },

    async sendPasswordReset(input) {
      const { transport: sender, config } = getTransport()
      const resetUrl = escapeHtml(input.resetUrl)
      const expiresAt = escapeHtml(input.expiresAt)
      try {
        await sender.sendMail({
          from: config.from,
          to: input.to,
          subject: '重置你的 Bailian Studio 密码',
          text: `请打开以下链接重置密码：\n${input.resetUrl}\n\n链接有效期至：${input.expiresAt}`,
          html: `<p>请点击下面的链接重置密码：</p><p><a href="${resetUrl}">重置密码</a></p><p>链接有效期至：${expiresAt}</p>`,
        })
        mailLogger.info('email.sent', { to: input.to, purpose: 'password_reset' })
      } catch (error) {
        mailLogger.error('email.send_failed', {
          to: input.to,
          purpose: 'password_reset',
          errorName: error instanceof Error ? error.name : 'unknown',
        })
        throw error
      }
    },
  }
}

function readSmtpConfig(source: EnvironmentSource): SmtpConfig {
  const host = source['SMTP_HOST']?.trim() || 'smtp.163.com'
  const user = source['SMTP_USER']?.trim()
  const pass = source['SMTP_PASS']?.trim()
  const hasUser = user !== undefined && user.length > 0
  const hasPass = pass !== undefined && pass.length > 0
  const isLocalNoAuth = isLoopbackHost(host)
    && source['NODE_ENV']?.trim().toLowerCase() !== 'production'
  if (hasUser !== hasPass || (!hasUser && !isLocalNoAuth)) {
    throw new Error('Transactional email is unavailable')
  }

  const portValue = source['SMTP_PORT']?.trim() || '465'
  const port = Number(portValue)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535')
  }

  const secureValue = source['SMTP_SECURE']?.trim().toLowerCase()
  if (secureValue !== undefined && secureValue !== '' && secureValue !== 'true' && secureValue !== 'false') {
    throw new Error('SMTP_SECURE must be true or false')
  }

  return {
    host,
    port,
    secure: secureValue === undefined || secureValue === '' ? true : secureValue === 'true',
    ...(hasUser && user !== undefined ? { user } : {}),
    ...(hasPass && pass !== undefined ? { pass } : {}),
    from: source['SMTP_FROM']?.trim() || user || 'no-reply@localhost',
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}
