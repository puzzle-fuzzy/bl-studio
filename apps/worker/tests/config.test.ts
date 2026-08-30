import { describe, expect, it } from 'vitest'
import { readWorkerEnv } from '../src/config'

describe('worker environment boundary', () => {
  it('normalizes explicit Bailian runtime configuration', () => {
    expect(readWorkerEnv({
      DATABASE_URL: ' postgres://db/bailian-studio ',
      DASHSCOPE_API_KEY: ' key-secret ',
      BAILIAN_WORKSPACE_ID: ' ws_demo-1 ',
      ERROR_LOCALE: ' en-US ',
      WORKER_ID: ' worker-a ',
    }, 99)).toEqual({
      databaseUrl: 'postgres://db/bailian-studio',
      dashscopeApiKey: 'key-secret',
      bailianWorkspaceId: 'ws_demo-1',
      errorLocale: 'en-US',
      workerId: 'worker-a',
    })
  })

  it('uses safe defaults for optional settings', () => {
    expect(readWorkerEnv({
      DATABASE_URL: 'postgres://db/bailian-studio',
      DASHSCOPE_API_KEY: 'key-secret',
      BAILIAN_WORKSPACE_ID: '   ',
      WORKER_ID: '',
    }, 42)).toMatchObject({
      errorLocale: 'zh-CN',
      workerId: 'worker-42',
    })
  })

  it('requires the database everywhere and the provider key in production', () => {
    expect(() => readWorkerEnv({ DASHSCOPE_API_KEY: 'key' })).toThrow(
      'DATABASE_URL 环境变量不能为空 / DATABASE_URL environment variable is required',
    )
    expect(() => readWorkerEnv({ DATABASE_URL: 'db', NODE_ENV: 'production' })).toThrow(
      'DASHSCOPE_API_KEY 环境变量不能为空 / DASHSCOPE_API_KEY environment variable is required',
    )
    expect(readWorkerEnv({ DATABASE_URL: 'db', DASHSCOPE_API_KEY: '   ' })).toMatchObject({
      databaseUrl: 'db',
    })
  })

  it('rejects invalid locale and workspace identifiers before startup', () => {
    const base = { DATABASE_URL: 'db', DASHSCOPE_API_KEY: 'key' }
    expect(() => readWorkerEnv({ ...base, ERROR_LOCALE: 'fr-FR' })).toThrow(
      '必须是 zh-CN 或 en-US',
    )
    expect(() => readWorkerEnv({ ...base, BAILIAN_WORKSPACE_ID: 'bad.example.com' })).toThrow(
      'may contain only letters, digits, hyphens, and underscores',
    )
  })

  it('parses positive provider and lifecycle timeout overrides', () => {
    expect(readWorkerEnv({
      DATABASE_URL: 'db',
      DASHSCOPE_API_KEY: 'key',
      DASHSCOPE_REQUEST_TIMEOUT_MS: '45000',
      GENERATION_SUBMIT_TIMEOUT_MS: '120000',
      PROVIDER_ASYNC_MAX_DURATION_MS: '1800000',
      ARTIFACT_PERSIST_TIMEOUT_MS: '900000',
      WORKER_LOCK_HEARTBEAT_MS: '30000',
      WORKER_HEARTBEAT_INTERVAL_MS: '5000',
    })).toMatchObject({
      dashscopeRequestTimeoutMs: 45_000,
      generationSubmitTimeoutMs: 120_000,
      providerAsyncMaxDurationMs: 1_800_000,
      artifactPersistTimeoutMs: 900_000,
      workerLockHeartbeatMs: 30_000,
      workerHeartbeatIntervalMs: 5_000,
    })
  })

  it('parses bounded provider artifact fetch policy', () => {
    expect(readWorkerEnv({
      DATABASE_URL: 'db',
      DASHSCOPE_API_KEY: 'key',
      ARTIFACT_FETCH_MAX_BYTES: '5242880',
      ARTIFACT_FETCH_TIMEOUT_MS: '15000',
      ARTIFACT_FETCH_MAX_REDIRECTS: '2',
      ARTIFACT_FETCH_ALLOWED_HOSTS: ' cdn.example.test, media.example.test ',
    })).toMatchObject({
      artifactFetchMaxBytes: 5_242_880,
      artifactFetchTimeoutMs: 15_000,
      artifactFetchMaxRedirects: 2,
      artifactFetchAllowedHosts: ['cdn.example.test', 'media.example.test'],
    })
  })

  it('rejects non-positive timeout overrides', () => {
    const base = { DATABASE_URL: 'db', DASHSCOPE_API_KEY: 'key' }
    expect(() => readWorkerEnv({ ...base, DASHSCOPE_REQUEST_TIMEOUT_MS: '0' })).toThrow('must be a positive integer')
    expect(() => readWorkerEnv({ ...base, ARTIFACT_PERSIST_TIMEOUT_MS: 'not-a-number' })).toThrow('must be a positive integer')
    expect(() => readWorkerEnv({ ...base, WORKER_LOCK_HEARTBEAT_MS: '0' })).toThrow('must be a positive integer')
    expect(() => readWorkerEnv({ ...base, WORKER_HEARTBEAT_INTERVAL_MS: '0' })).toThrow('must be a positive integer')
    expect(() => readWorkerEnv({ ...base, ARTIFACT_FETCH_MAX_BYTES: '0' })).toThrow('must be a positive integer')
    expect(() => readWorkerEnv({ ...base, ARTIFACT_FETCH_MAX_REDIRECTS: '-1' })).toThrow('must be a non-negative integer')
  })

  it('rejects malformed provider artifact host allowlists', () => {
    const base = { DATABASE_URL: 'db', DASHSCOPE_API_KEY: 'key' }
    expect(() => readWorkerEnv({ ...base, ARTIFACT_FETCH_ALLOWED_HOSTS: 'https://cdn.example.test' })).toThrow('must contain hostnames')
    expect(() => readWorkerEnv({ ...base, ARTIFACT_FETCH_ALLOWED_HOSTS: 'localhost' })).toThrow('must contain hostnames')
  })

  it('rejects production startup when OSS storage is incomplete', () => {
    expect(() => readWorkerEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'db',
      DASHSCOPE_API_KEY: 'key',
      OSS_REGION: 'oss-cn-hangzhou',
    })).toThrow('Production requires complete OSS storage configuration')
  })

  it('accepts complete production OSS configuration', () => {
    expect(readWorkerEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'db',
      DASHSCOPE_API_KEY: 'key',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_BUCKET: 'bailian-studio',
      OSS_ACCESS_KEY_ID: 'id',
      OSS_ACCESS_KEY_SECRET: 'secret',
    })).toMatchObject({ databaseUrl: 'db', dashscopeApiKey: 'key' })
  })
})
