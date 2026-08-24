import { describe, expect, it } from 'vitest'
import { buildBackupEnvironment, renderBackupEnvironment } from './prepare-backup-env'

function validAppEnvironment(): Record<string, string> {
  return {
    OSS_REGION: 'oss-cn-shanghai',
    OSS_BUCKET: 'bailian-studio-prod',
    OSS_ACCESS_KEY_ID: 'access-key-id',
    OSS_ACCESS_KEY_SECRET: 'access-key-secret',
    OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
  }
}

describe('backup environment projection', () => {
  it('projects only the OSS settings required by the backup service', () => {
    expect(buildBackupEnvironment(validAppEnvironment(), {
      BACKUP_OSS_UPLOAD: 'true',
      BACKUP_OSS_PREFIX: '/bailian-studio/backups/',
      DASHSCOPE_API_KEY: 'must-not-be-copied',
    })).toEqual({
      BACKUP_OSS_UPLOAD: 'true',
      OSS_REGION: 'oss-cn-shanghai',
      OSS_BUCKET: 'bailian-studio-prod',
      OSS_ACCESS_KEY_ID: 'access-key-id',
      OSS_ACCESS_KEY_SECRET: 'access-key-secret',
      OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
      BACKUP_OSS_PREFIX: 'bailian-studio/backups',
    })
  })

  it('fails closed when OSS is enabled without a required credential', () => {
    expect(() => buildBackupEnvironment({
      ...validAppEnvironment(),
      OSS_ACCESS_KEY_SECRET: undefined,
    }, { BACKUP_OSS_UPLOAD: 'true' })).toThrow('OSS_ACCESS_KEY_SECRET')
  })

  it('supports an explicit disabled-OSS acknowledgement without copying app secrets', () => {
    expect(buildBackupEnvironment({ DASHSCOPE_API_KEY: 'must-not-be-copied' }, {
      BACKUP_OSS_UPLOAD: 'false',
      BACKUP_OSS_DISABLED_ACK: 'confirmed',
    })).toEqual({ BACKUP_OSS_UPLOAD: 'false' })
  })

  it('quotes values that are unsafe as raw dotenv values', () => {
    const rendered = renderBackupEnvironment({
      BACKUP_OSS_UPLOAD: 'true',
      OSS_ACCESS_KEY_SECRET: 'secret with spaces # and "quotes"',
    })

    expect(rendered).toContain('OSS_ACCESS_KEY_SECRET="secret with spaces # and \\"quotes\\""')
  })
})
