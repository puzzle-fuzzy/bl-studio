import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEV_DATABASE_URL, TEST_DATABASE_URL } from '../packages/db/src/defaults'

/**
 * P2-33：本地 dev/test 数据库连接串的三处来源一致性。
 *
 * defaults.ts 是规范来源（canonical）；package.json 的 db:* 脚本因 drizzle-kit
 * 子进程不读 env-file（见 defaults.ts 注释）必须内联 URL，.env.example /
 * .env.test.example 又要文档化同一份。三处任何一处改串而漏改其余，这里就红。
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** 从脚本命令中提取所有内联 DATABASE_URL=<url> 的值（URL 以空白或 &&/& 结束）。 */
function inlineDatabaseUrls(script: string): string[] {
  return [...script.matchAll(/DATABASE_URL=([^\s&|]+)/g)].map(match => match[1]!)
}

/** 读取 env 文件中第一处 DATABASE_URL= 的值。 */
function envFileDatabaseUrl(file: string): string | undefined {
  const content = readFileSync(file, 'utf8')
  const line = content.split('\n').find(candidate => candidate.startsWith('DATABASE_URL='))
  return line?.split('=').slice(1).join('=')
}

describe('数据库连接串三处来源一致（P2-33）', () => {
  const canonical = [DEV_DATABASE_URL, TEST_DATABASE_URL]

  it('package.json 的 db:* 脚本内联 DATABASE_URL 与 defaults.ts 一致', () => {
    const pkg = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8')) as { scripts: Record<string, string> }
    const dbScripts = Object.entries(pkg.scripts).filter(([name]) => name.startsWith('db:'))
    expect(dbScripts.length, '应存在 db:* 脚本').toBeGreaterThan(0)

    for (const [name, script] of dbScripts) {
      for (const url of inlineDatabaseUrls(script)) {
        expect(canonical, `db:${name} 内联的 DATABASE_URL "${url}" 与 defaults.ts 不一致`).toContain(url)
      }
    }
  })

  it('.env.example / .env.test.example 的 DATABASE_URL 与 defaults.ts 一致', () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ['infra/env/.env.example', DEV_DATABASE_URL],
      ['infra/env/.env.test.example', TEST_DATABASE_URL],
    ]
    for (const [file, expectedUrl] of expected) {
      const url = envFileDatabaseUrl(`${repoRoot}${file}`)
      expect(url, `${file} 缺少 DATABASE_URL`).toBeDefined()
      expect(url, `${file} 的 DATABASE_URL 与 defaults.ts 不一致`).toBe(expectedUrl)
    }
  })
})
