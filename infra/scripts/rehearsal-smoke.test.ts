import { describe, expect, it } from 'vitest'
import {
  isReadyPayload,
  parseRehearsalArgs,
  runRehearsalSmoke,
  verifyJsonLogLines,
  verifyWebRelease,
} from './rehearsal-smoke'

const releaseSecurityHeaders = {
  'content-security-policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
}

describe('rehearsal smoke command', () => {
  it('defaults to a clean build and teardown', () => {
    expect(parseRehearsalArgs([])).toEqual({
      build: true,
      keep: false,
      apiOrigin: 'http://127.0.0.1:5013',
      webOrigin: 'http://127.0.0.1:5012',
    })
  })

  it('supports no-build and keep switches', () => {
    expect(parseRehearsalArgs(['--no-build', '--keep']).build).toBe(false)
    expect(parseRehearsalArgs(['--no-build', '--keep']).keep).toBe(true)
  })

  it('rejects unknown switches', () => {
    expect(() => parseRehearsalArgs(['--force'])).toThrow('Unknown rehearsal smoke option')
  })

  it('accepts only a fully ready API payload', () => {
    expect(isReadyPayload({
      success: true,
      data: { status: 'ok', checks: { database: 'ok', storage: 'ok', worker: 'ok' } },
    })).toBe(true)
    expect(isReadyPayload({
      success: true,
      data: { status: 'degraded', checks: { database: 'ok', storage: 'ok', worker: 'failed' } },
    })).toBe(false)
    expect(isReadyPayload({ success: true, data: { status: 'ok' } })).toBe(false)
  })

  it('runs the health, queue, log-format, restart, and teardown sequence', async () => {
    const commands: string[][] = []
    const runCommand = async (args: readonly string[]): Promise<void> => {
      commands.push([...args])
    }
    const captureCommand = async (args: readonly string[]): Promise<string> => {
      commands.push([...args])
      return 'bailian-studio-rehearsal-api-1  | {"ts":"2026-08-04T00:00:00.000Z","level":"info","scope":"api","msg":"request.completed"}\n'
    }
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.includes('/assets/')) {
        return new Response('console.log("release")', {
          headers: {
            ...releaseSecurityHeaders,
            'cache-control': 'max-age=31536000',
            'content-encoding': 'gzip',
            'content-type': 'application/javascript',
          },
        })
      }
      if (url.endsWith('/')) {
        return new Response('<!doctype html><script src="/assets/index-release.js"></script>', {
          headers: {
            ...releaseSecurityHeaders,
            'cache-control': 'no-cache',
            'content-type': 'text/html',
          },
        })
      }
      return new Response(JSON.stringify({
        success: true,
        data: { status: 'ok', checks: { database: 'ok', storage: 'ok', worker: 'ok' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    await runRehearsalSmoke(parseRehearsalArgs(['--no-build']), runCommand, fetchImpl, captureCommand)

    expect(commands).toEqual([
      ['down', '--volumes', '--remove-orphans'],
      ['up', '-d', '--no-build', '--pull', 'never'],
      ['logs', 'api'],
      ['--profile', 'ops', 'run', '--rm', 'ops-health'],
      ['restart', 'api', 'worker'],
      ['down', '--volumes', '--remove-orphans'],
    ])
  })

  it('accepts JSON-lines entries with a compose service prefix and rejects plain logs', () => {
    expect(() => verifyJsonLogLines('plain text startup line\n')).toThrow('JSON-lines')
    expect(() => verifyJsonLogLines(
      'bailian-studio-rehearsal-api-1  | {"ts":"2026-08-04T00:00:00Z","level":"error","scope":"api","msg":"request.failed"}',
    )).not.toThrow()
  })

  it('rejects a Web release without immutable asset caching', async () => {
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.includes('/assets/')) {
        return new Response('console.log("release")', {
          headers: {
            ...releaseSecurityHeaders,
            'cache-control': 'no-cache',
            'content-encoding': 'gzip',
          },
        })
      }
      return new Response('<!doctype html><script src="/assets/index-release.js"></script>', {
        headers: {
          ...releaseSecurityHeaders,
          'cache-control': 'no-cache',
        },
      })
    }) as typeof fetch

    await expect(verifyWebRelease('http://127.0.0.1:5012/', fetchImpl)).rejects.toThrow(
      'cached for one year',
    )
  })

  it('cleans up when startup fails', async () => {
    const commands: string[][] = []
    const runCommand = async (args: readonly string[]): Promise<void> => {
      commands.push([...args])
      if (args[0] === 'up') throw new Error('docker unavailable')
    }

    await expect(runRehearsalSmoke(parseRehearsalArgs(['--no-build']), runCommand)).rejects.toThrow('docker unavailable')
    expect(commands).toEqual([
      ['down', '--volumes', '--remove-orphans'],
      ['up', '-d', '--no-build', '--pull', 'never'],
      ['down', '--volumes', '--remove-orphans'],
    ])
  })

  it('builds image owners before starting image-only consumers', async () => {
    const commands: string[][] = []
    const runCommand = async (args: readonly string[]): Promise<void> => {
      commands.push([...args])
      if (args[0] === 'up') throw new Error('stop after build ordering check')
    }

    await expect(runRehearsalSmoke(parseRehearsalArgs([]), runCommand)).rejects.toThrow(
      'stop after build ordering check',
    )
    expect(commands).toEqual([
      ['down', '--volumes', '--remove-orphans'],
      ['build', 'api', 'web'],
      ['up', '-d', '--no-build', '--pull', 'never'],
      ['down', '--volumes', '--remove-orphans'],
    ])
  })
})
