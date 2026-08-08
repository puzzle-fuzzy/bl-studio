import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { buildBackupObjectKey, uploadBackupFile, type OssUploadClient } from './upload-backup-to-oss'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function validEnvironment(): Record<string, string> {
  return {
    OSS_REGION: 'oss-cn-shanghai',
    OSS_BUCKET: 'bailian-studio-prod',
    OSS_ACCESS_KEY_ID: 'access-key-id',
    OSS_ACCESS_KEY_SECRET: 'access-key-secret',
    OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
    BACKUP_OSS_PREFIX: 'bailian-studio/backups',
  }
}

async function makeBackupFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bl-studio-backup-test-'))
  tempDirectories.push(directory)
  const filePath = join(directory, 'bailian-studio-20260808T000000Z.sql.gz')
  await writeFile(filePath, 'backup')
  return filePath
}

describe('backup OSS uploader', () => {
  it('normalizes the prefix and uses only the backup filename', () => {
    expect(buildBackupObjectKey('/tmp/bailian-studio.sql.gz', '/bailian-studio/backups/'))
      .toBe('bailian-studio/backups/bailian-studio.sql.gz')
  })

  it('rejects incomplete OSS configuration without exposing values', async () => {
    const filePath = await makeBackupFile()

    await expect(uploadBackupFile(filePath, {
      ...validEnvironment(),
      OSS_ACCESS_KEY_SECRET: undefined,
    })).rejects.toThrow('OSS_ACCESS_KEY_SECRET')
  })

  it('rejects a missing backup file before calling the client', async () => {
    const calls: string[] = []
    const client: OssUploadClient = {
      async put(key) {
        calls.push(key)
      },
    }

    await expect(uploadBackupFile('/tmp/does-not-exist.sql.gz', validEnvironment(), client)).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('uploads the file to the configured prefix', async () => {
    const filePath = await makeBackupFile()
    const calls: Array<{ key: string; filePath: string }> = []
    const client: OssUploadClient = {
      async put(key, uploadedFilePath) {
        calls.push({ key, filePath: uploadedFilePath })
      },
    }

    await expect(uploadBackupFile(filePath, validEnvironment(), client)).resolves.toEqual({
      key: 'bailian-studio/backups/bailian-studio-20260808T000000Z.sql.gz',
    })
    expect(calls).toEqual([{
      key: 'bailian-studio/backups/bailian-studio-20260808T000000Z.sql.gz',
      filePath,
    }])
  })
})
