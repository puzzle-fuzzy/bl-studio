import { describe, expect, it } from 'vitest'
import {
  checkProductionEnvironment,
  checkProductionInfrastructure,
  checkProductionReleaseSource,
  formatProductionPreflightFailure,
} from './check-production-env'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'

function validEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    BAILIAN_STUDIO_RELEASE_TAG: releaseSha,
    DATABASE_URL: 'postgres://forge:secret@db.internal:5432/bailian-studio',
    DASHSCOPE_API_KEY: 'sk-real-provider-key',
    AUTH_JWT_SECRET: 'a'.repeat(32),
    AUTH_PUBLIC_WEB_ORIGIN: 'https://create.yxswy.com',
    SMTP_HOST: 'smtp.163.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'mailer@163.com',
    SMTP_PASS: 'smtp-authorization-code',
    SMTP_FROM: 'Bailian Studio <mailer@163.com>',
    COOKIE_SECURE: 'true',
    CSRF_REQUIRE_ORIGIN: 'true',
    API_RATE_LIMIT_ENABLED: 'true',
    CORS_ALLOWED_ORIGINS: 'https://create.yxswy.com',
    VITE_WEB_ORIGIN: 'https://create.yxswy.com',
    VITE_API_ORIGIN: '',
    OSS_REGION: 'oss-cn-shanghai',
    OSS_BUCKET: 'bailian-studio-prod',
    OSS_ACCESS_KEY_ID: 'access-key-id',
    OSS_ACCESS_KEY_SECRET: 'access-key-secret',
    MEDIA_MAX_DURATION_SECONDS: '1800',
    API_MAX_JSON_BODY_BYTES: '2097152',
    API_MAX_MULTIPART_BODY_BYTES: '125829120',
    API_MAX_OTHER_BODY_BYTES: '8388608',
    GENERATION_DAILY_TASK_LIMIT: '0',
    GENERATION_DAILY_COST_LIMIT_CENTS: '0',
  }
}

describe('production environment preflight', () => {
  it('accepts a complete production configuration without network calls', () => {
    const result = checkProductionEnvironment(validEnvironment())

    expect(result.issues).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('rejects placeholders and unsafe production flags without exposing values', () => {
    const result = checkProductionEnvironment({
      ...validEnvironment(),
      DATABASE_URL: 'postgres://bailian-studio:CHANGE_ME@db.example.internal:5432/bailian-studio',
      AUTH_JWT_SECRET: 'dev-secret-change-me',
      COOKIE_SECURE: 'false',
      CORS_ALLOWED_ORIGINS: 'https://your-domain.example',
      VITE_WEB_ORIGIN: 'https://your-domain.example',
      OSS_BUCKET: 'replace-with-oss-bucket',
    })

    expect(result.issues.map(issue => issue.key)).toEqual([
      'DATABASE_URL',
      'AUTH_JWT_SECRET',
      'OSS_BUCKET',
      'COOKIE_SECURE',
      'CORS_ALLOWED_ORIGINS',
      'VITE_WEB_ORIGIN',
    ])
    const message = formatProductionPreflightFailure(result)
    expect(message).toContain('DATABASE_URL')
    expect(message).not.toContain('CHANGE_ME')
    expect(message).not.toContain('dev-secret-change-me')
    expect(message).not.toContain('replace-with-oss-bucket')
  })

  it('allows the personal default of no daily cost or task cap', () => {
    const result = checkProductionEnvironment({
      ...validEnvironment(),
      GENERATION_DAILY_TASK_LIMIT: '0',
      GENERATION_DAILY_COST_LIMIT_CENTS: '0',
    })

    expect(result.issues).toEqual([])
  })

  it('requires every production SMTP identity and credential without exposing values', () => {
    const result = checkProductionEnvironment({
      ...validEnvironment(),
      SMTP_HOST: ' ',
      SMTP_USER: '',
      SMTP_PASS: '\t',
      SMTP_FROM: '   ',
    })

    expect(result.issues.map(issue => issue.key).filter(key => key.startsWith('SMTP_'))).toEqual([
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ])

    const message = formatProductionPreflightFailure(result)
    expect(message).toContain('SMTP_HOST')
    expect(message).toContain('SMTP_USER')
    expect(message).toContain('SMTP_PASS')
    expect(message).toContain('SMTP_FROM')
    expect(message).not.toContain('mailer@163.com')
    expect(message).not.toContain('smtp-authorization-code')
  })

  it('rejects a non-HTTPS public authentication origin as an error', () => {
    const publicOrigin = 'http://create.yxswy.com'
    const result = checkProductionEnvironment({
      ...validEnvironment(),
      AUTH_PUBLIC_WEB_ORIGIN: publicOrigin,
    })

    expect(result.issues.map(issue => issue.key)).toContain('AUTH_PUBLIC_WEB_ORIGIN')
    expect(result.warnings).toEqual([])
    expect(formatProductionPreflightFailure(result)).not.toContain(publicOrigin)
  })

  it('requires an immutable full Git commit release tag', () => {
    const missing = checkProductionEnvironment({
      ...validEnvironment(),
      BAILIAN_STUDIO_RELEASE_TAG: '',
    })
    const mutable = checkProductionEnvironment({
      ...validEnvironment(),
      BAILIAN_STUDIO_RELEASE_TAG: 'latest',
    })

    expect(missing.issues.map(issue => issue.key)).toContain('BAILIAN_STUDIO_RELEASE_TAG')
    expect(mutable.issues.map(issue => issue.key)).toContain('BAILIAN_STUDIO_RELEASE_TAG')
    expect(formatProductionPreflightFailure(mutable)).not.toContain('latest')
  })

  it('accepts only a clean checkout matching the configured release tag', () => {
    expect(checkProductionReleaseSource(validEnvironment(), {
      headSha: releaseSha,
      worktreeClean: true,
    })).toEqual([])

    const differentSha = 'fedcba9876543210fedcba9876543210fedcba98'
    const issues = checkProductionReleaseSource(validEnvironment(), {
      headSha: differentSha,
      worktreeClean: false,
    })

    expect(issues.map(issue => issue.key)).toEqual(['GIT_WORKTREE', 'BAILIAN_STUDIO_RELEASE_TAG'])
    const message = formatProductionPreflightFailure({ issues, warnings: [] })
    expect(message).not.toContain(releaseSha)
    expect(message).not.toContain(differentSha)
  })

  it('rejects a release source whose Git identity cannot be verified', () => {
    expect(checkProductionReleaseSource(validEnvironment(), {
      headSha: undefined,
      worktreeClean: undefined,
    }).map(issue => issue.key)).toEqual(['GIT_HEAD', 'GIT_WORKTREE'])
  })

  it('allows LOG_FORMAT to be unset (production defaults to json) without issues', () => {
    expect(checkProductionEnvironment(validEnvironment()).issues.map(issue => issue.key))
      .not.toContain('LOG_FORMAT')
  })

  it('rejects an invalid or production-console LOG_FORMAT value', () => {
    const invalid = checkProductionEnvironment({
      ...validEnvironment(),
      LOG_FORMAT: 'pretty',
    })
    expect(invalid.issues.map(issue => issue.key)).toContain('LOG_FORMAT')

    const consoleInProduction = checkProductionEnvironment({
      ...validEnvironment(),
      LOG_FORMAT: 'console',
    })
    expect(consoleInProduction.issues.map(issue => issue.key)).toContain('LOG_FORMAT')
  })

  it('keeps public launch disabled until legal identity and contact fields are complete', () => {
    const draft = checkProductionEnvironment({
      ...validEnvironment(),
      PUBLIC_WEB_LAUNCH: 'false',
    })
    expect(draft.issues).toEqual([])

    const incomplete = checkProductionEnvironment({
      ...validEnvironment(),
      PUBLIC_WEB_LAUNCH: 'true',
      VITE_LEGAL_ENTITY: '',
      VITE_LEGAL_CONTACT_EMAIL: 'not-an-email',
      VITE_LEGAL_EFFECTIVE_DATE: '待填写',
    })
    expect(incomplete.issues.map(issue => issue.key)).toEqual([
      'VITE_LEGAL_ENTITY',
      'VITE_LEGAL_EFFECTIVE_DATE',
      'VITE_LEGAL_CONTACT_EMAIL',
    ])

    const complete = checkProductionEnvironment({
      ...validEnvironment(),
      PUBLIC_WEB_LAUNCH: 'true',
      VITE_LEGAL_ENTITY: '某某科技有限公司',
      VITE_LEGAL_CONTACT_EMAIL: 'legal@yxswy.com',
      VITE_LEGAL_EFFECTIVE_DATE: '2026-08-08',
    })
    expect(complete.issues).toEqual([])
  })
})

function validInfrastructure(): Record<string, string> {
  return {
    SITE_DOMAIN: 'create.yxswy.com',
    LOGS_DOMAIN: 'logs.yxswy.com',
    LE_EMAIL: 'ops@yxswy.com',
    GRAFANA_ADMIN_USER: 'viewer',
    GRAFANA_ADMIN_PASSWORD: 'a-long-grafana-password',
    POSTGRES_USER: 'bailian-studio',
    POSTGRES_PASSWORD: 'a-long-db-password',
    POSTGRES_DB: 'bailian-studio',
    BACKUP_DIR: '/backups',
    BACKUP_RETENTION_DAYS: '14',
    BACKUP_OSS_UPLOAD: 'true',
    LOKI_RETENTION_DAYS: '31',
    DEPLOY_HOST: 'deploy@203.0.113.5',
  }
}

describe('production infrastructure preflight', () => {
  it('accepts a complete infrastructure configuration', () => {
    const result = checkProductionInfrastructure(validInfrastructure())
    expect(result.issues).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('rejects placeholder domains, short passwords and non-hostname domains', () => {
    const result = checkProductionInfrastructure({
      ...validInfrastructure(),
      SITE_DOMAIN: 'your-domain.example',
      LOGS_DOMAIN: 'https://logs.example.com/path',
      GRAFANA_ADMIN_PASSWORD: 'short',
      POSTGRES_PASSWORD: 'CHANGE_ME',
      BACKUP_RETENTION_DAYS: 'abc',
      DEPLOY_HOST: 'replace-with-user@host',
    })

    expect(result.issues.map(issue => issue.key)).toEqual([
      'SITE_DOMAIN',
      'LOGS_DOMAIN',
      'GRAFANA_ADMIN_PASSWORD',
      'POSTGRES_PASSWORD',
      'BACKUP_RETENTION_DAYS',
      'DEPLOY_HOST',
    ])
    expect(formatProductionPreflightFailure(result)).not.toContain('https://logs.example.com/path')
  })

  it('requires an explicit OSS disaster-recovery choice (P0-07)', () => {
    const missing = checkProductionInfrastructure({
      ...validInfrastructure(),
      BACKUP_OSS_UPLOAD: undefined,
    })
    expect(missing.issues.map(issue => issue.key)).toContain('BACKUP_OSS_UPLOAD')

    const offWithoutAck = checkProductionInfrastructure({
      ...validInfrastructure(),
      BACKUP_OSS_UPLOAD: 'false',
    })
    expect(offWithoutAck.issues.map(issue => issue.key)).toEqual(['BACKUP_OSS_UPLOAD'])

    const offWithAck = checkProductionInfrastructure({
      ...validInfrastructure(),
      BACKUP_OSS_UPLOAD: 'false',
      BACKUP_OSS_DISABLED_ACK: 'confirmed',
    })
    expect(offWithAck.issues).toEqual([])

    const invalidValue = checkProductionInfrastructure({
      ...validInfrastructure(),
      BACKUP_OSS_UPLOAD: 'maybe',
    })
    expect(invalidValue.issues.map(issue => issue.key)).toEqual(['BACKUP_OSS_UPLOAD'])
  })

  it('validates monitor thresholds and required HTTPS alert webhook', () => {
    const invalid = checkProductionInfrastructure({
      ...validInfrastructure(),
      MONITOR_INTERVAL_SECONDS: '0',
      MONITOR_BACKUP_MAX_AGE_HOURS: 'abc',
      MONITOR_DISK_USED_PERCENT: '101',
      MONITOR_ALERT_REQUIRED: 'true',
      MONITOR_ALERT_WEBHOOK_URL: 'http://hooks.example.com',
    })
    expect(invalid.issues.map(issue => issue.key)).toEqual([
      'MONITOR_INTERVAL_SECONDS',
      'MONITOR_BACKUP_MAX_AGE_HOURS',
      'MONITOR_DISK_USED_PERCENT',
      'MONITOR_ALERT_WEBHOOK_URL',
    ])

    const valid = checkProductionInfrastructure({
      ...validInfrastructure(),
      MONITOR_INTERVAL_SECONDS: '60',
      MONITOR_BACKUP_MAX_AGE_HOURS: '30',
      MONITOR_DISK_USED_PERCENT: '85',
      MONITOR_ALERT_REQUIRED: 'true',
      MONITOR_ALERT_WEBHOOK_URL: 'https://hooks.example.com/notify',
    })
    expect(valid.issues).toEqual([])
  })
})
