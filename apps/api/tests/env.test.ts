import { describe, expect, it } from 'vitest'
import { readApiEnvOrThrow } from '../src/lib/env'

describe('API environment boundary', () => {
  it('accepts the minimum development configuration', () => {
    expect(readApiEnvOrThrow({
      DATABASE_URL: 'postgres://db/bailian-studio',
      AUTH_JWT_SECRET: 'dev-secret-change-me',
    })).toMatchObject({
      databaseUrl: 'postgres://db/bailian-studio',
      authJwtSecret: 'dev-secret-change-me',
      authPublicWebOrigin: 'http://localhost:5004',
    })
  })

  it('rejects unsafe production authentication settings', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/bailian-studio',
      AUTH_JWT_SECRET: 'too-short',
      COOKIE_SECURE: 'true',
      CSRF_REQUIRE_ORIGIN: 'true',
      API_TRUST_PROXY: 'true',
      CORS_ALLOWED_ORIGINS: 'https://forge.example.com',
      AUTH_PUBLIC_WEB_ORIGIN: 'https://forge.example.com',
      SMTP_HOST: 'smtp.163.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@163.com',
      SMTP_PASS: 'authorization-code',
      SMTP_FROM: 'Bailian Studio <mailer@163.com>',
    }

    expect(() => readApiEnvOrThrow(base)).toThrow('AUTH_JWT_SECRET')
    expect(() => readApiEnvOrThrow({ ...base, AUTH_JWT_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'false' })).toThrow('COOKIE_SECURE=true')
    expect(() => readApiEnvOrThrow({ ...base, AUTH_JWT_SECRET: 'x'.repeat(32), CORS_ALLOWED_ORIGINS: 'http://localhost:5002' })).toThrow('non-local explicit origins')
  })

  it('requires an explicit SMTP sender in production', () => {
    expect(() => readApiEnvOrThrow({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/bailian-studio',
      AUTH_JWT_SECRET: 'x'.repeat(32),
      COOKIE_SECURE: 'true',
      CSRF_REQUIRE_ORIGIN: 'true',
      API_TRUST_PROXY: 'true',
      CORS_ALLOWED_ORIGINS: 'https://forge.example.com',
      AUTH_PUBLIC_WEB_ORIGIN: 'https://forge.example.com',
      SMTP_HOST: 'smtp.163.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@163.com',
      SMTP_PASS: 'authorization-code',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_BUCKET: 'bailian-studio',
      OSS_ACCESS_KEY_ID: 'id',
      OSS_ACCESS_KEY_SECRET: 'secret',
    })).toThrow('complete SMTP configuration')
  })

  it('accepts explicit secure production origins', () => {
    expect(readApiEnvOrThrow({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/bailian-studio',
      AUTH_JWT_SECRET: 'x'.repeat(32),
      COOKIE_SECURE: 'true',
      CSRF_REQUIRE_ORIGIN: 'true',
      API_TRUST_PROXY: 'true',
      CORS_ALLOWED_ORIGINS: 'https://forge.example.com,https://team.example.com',
      AUTH_PUBLIC_WEB_ORIGIN: 'https://forge.example.com',
      SMTP_HOST: 'smtp.163.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@163.com',
      SMTP_PASS: 'authorization-code',
      SMTP_FROM: 'Bailian Studio <mailer@163.com>',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_BUCKET: 'bailian-studio',
      OSS_ACCESS_KEY_ID: 'id',
      OSS_ACCESS_KEY_SECRET: 'secret',
    })).toMatchObject({
      databaseUrl: 'postgres://db/bailian-studio',
      authJwtSecret: 'x'.repeat(32),
    })
  })
})
