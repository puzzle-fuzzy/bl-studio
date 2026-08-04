import { describe, expect, it } from 'vitest'
import type { Logger } from '@bailian-studio/shared'
import { createStorageFromEnv } from '../src'

function captureWarnings(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = []
  return {
    warnings,
    logger: {
      info: () => {},
      warn: message => warnings.push(message),
      error: () => {},
    },
  }
}

describe('createStorageFromEnv', () => {
  it('falls back to local storage without warning when OSS config is absent', () => {
    const { logger, warnings } = captureWarnings()
    const adapter = createStorageFromEnv({
      env: {
        ARTIFACT_LOCAL_ROOT: 'var/test-artifacts',
        ARTIFACT_LOCAL_PUBLIC_BASE_URL: '/api/artifacts/local',
      },
      logger,
    })

    expect(adapter.provider).toBe('local')
    expect(warnings).toEqual([])
  })

  it('falls back to local storage with warning when OSS config is partial', () => {
    const { logger, warnings } = captureWarnings()
    const adapter = createStorageFromEnv({
      env: {
        OSS_REGION: 'oss-cn-hangzhou',
        OSS_BUCKET: 'bailian-studio-test',
        ARTIFACT_LOCAL_ROOT: 'var/test-artifacts',
        ARTIFACT_LOCAL_PUBLIC_BASE_URL: '/api/artifacts/local',
      },
      logger,
    })

    expect(adapter.provider).toBe('local')
    expect(warnings).toEqual(['storage.oss_incomplete_using_local'])
  })

  it('falls back to local storage with warning when required OSS values are blank', () => {
    const { logger, warnings } = captureWarnings()
    const adapter = createStorageFromEnv({
      env: {
        OSS_REGION: 'oss-cn-hangzhou',
        OSS_BUCKET: ' ',
        OSS_ACCESS_KEY_ID: 'id',
        OSS_ACCESS_KEY_SECRET: 'secret',
        ARTIFACT_LOCAL_ROOT: 'var/test-artifacts',
        ARTIFACT_LOCAL_PUBLIC_BASE_URL: '/api/artifacts/local',
      },
      logger,
    })

    expect(adapter.provider).toBe('local')
    expect(warnings).toEqual(['storage.oss_incomplete_using_local'])
  })

  it('falls back to local storage with warning when required OSS values are all blank', () => {
    const { logger, warnings } = captureWarnings()
    const adapter = createStorageFromEnv({
      env: {
        OSS_REGION: '',
        OSS_BUCKET: ' ',
        OSS_ACCESS_KEY_ID: '',
        OSS_ACCESS_KEY_SECRET: '   ',
        ARTIFACT_LOCAL_ROOT: 'var/test-artifacts',
        ARTIFACT_LOCAL_PUBLIC_BASE_URL: '/api/artifacts/local',
      },
      logger,
    })

    expect(adapter.provider).toBe('local')
    expect(warnings).toEqual(['storage.oss_incomplete_using_local'])
  })

  it('selects OSS when all required OSS env values are present', () => {
    const adapter = createStorageFromEnv({
      env: {
        OSS_REGION: 'oss-cn-hangzhou',
        OSS_BUCKET: 'bailian-studio-test',
        OSS_ACCESS_KEY_ID: 'id',
        OSS_ACCESS_KEY_SECRET: 'secret',
      },
    })

    expect(adapter.provider).toBe('oss')
  })

  it('does not silently fall back to local storage in production', () => {
    expect(() => createStorageFromEnv({
      env: {
        NODE_ENV: 'production',
        OSS_REGION: 'oss-cn-hangzhou',
        OSS_BUCKET: 'bailian-studio-test',
        ARTIFACT_LOCAL_ROOT: 'var/test-artifacts',
      },
    })).toThrow('Production storage requires complete OSS configuration')
  })
})
