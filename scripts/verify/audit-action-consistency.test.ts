/**
 * P1-44：审计动作集合四处手写、无自动一致性检查。
 *
 * 现在 AUDIT_ACTIONS（@bailian-studio/generation-repository）是唯一运行时事实源，
 * 类型由它派生。本测试把三处「手工投影」逐一与它比对，防止新增 audit action 时漏改一处：
 *   1. packages/db/src/schema/identity.ts 的 audit_logs_action_check CHECK 内联列表；
 *   2. packages/db/drizzle/*.sql 里所有内嵌该 CHECK 的迁移（断言单调增长，最新一份 == AUDIT_ACTIONS）；
 *   3. ensure-audit-action-constraint.ts 已改为直接 import AUDIT_ACTIONS（编译期即锁定），
 *      这里顺带断言它不再内联手抄、且重建走 NOT VALID + VALIDATE。
 * 进 verify（test:root 会跑 scripts/*.test.ts）。
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AUDIT_ACTIONS } from '@bailian-studio/generation-repository'

const root = fileURLToPath(new URL('../..', import.meta.url))
// schema 按域拆分后，audit_logs 的 CHECK 定义位于 identity 域文件。
const schemaSource = readFileSync(`${root}/packages/db/src/schema/identity.ts`, 'utf8')
const ensureSource = readFileSync(`${root}/scripts/db/ensure-audit-action-constraint.ts`, 'utf8')

/** 从 `in ('a', 'b')` 段落里提取 action 集合。 */
function actionsFromInList(match: string): string[] {
  const inParens = match.match(/in \(([^)]*)\)/)
  if (inParens === null) throw new Error(`cannot parse action list: ${match.slice(0, 80)}`)
  const actions = [...inParens[1]!.matchAll(/'([^']+)'/g)].map(entry => entry[1]!)
  // 只保留审计动作（含点号），过滤掉 `::text` 等误入项。
  return actions.filter(action => action.includes('.'))
}

/** 从 schema.ts 的 check('audit_logs_action_check', ...) 提取动作集合。 */
function schemaAuditActions(): string[] {
  const check = schemaSource.match(/check\('audit_logs_action_check',[\s\S]*?\)`\)/)
  if (check === null) throw new Error('schema.ts 缺少 audit_logs_action_check CHECK 定义')
  return actionsFromInList(check[0]!)
}

/** 从某个迁移 SQL 文件里提取该 CHECK 的动作集合（只取 ADD 那份，忽略 DROP）。 */
function migrationAuditActions(migrationSql: string): string[] {
  const add = migrationSql.match(/ADD CONSTRAINT "audit_logs_action_check"[\s\S]*?in \(([^)]*)\)/)
  if (add === null) throw new Error('迁移缺少 ADD CONSTRAINT audit_logs_action_check')
  return actionsFromInList(add[0])
}

const migrationFiles = readdirSync(`${root}/packages/db/drizzle`)
  .filter(name => name.endsWith('.sql'))
  .sort()

describe('audit action constraint consistency (P1-44)', () => {
  it('schema.ts 的 CHECK 与 AUDIT_ACTIONS 完全一致', () => {
    const expected = [...AUDIT_ACTIONS].sort()
    const actual = schemaAuditActions().sort()
    expect(actual).toEqual(expected)
  })

  it('迁移链里的 CHECK 单调增长，且最新一份 == AUDIT_ACTIONS', () => {
    const migrationsWithCheck = migrationFiles.filter(name =>
      readFileSync(`${root}/packages/db/drizzle/${name}`, 'utf8').includes('audit_logs_action_check'),
    )
    // 当前共有 10 个迁移内嵌该 CHECK（新增 audit action 时逐批 ADD）。
    expect(migrationsWithCheck.length).toBeGreaterThanOrEqual(1)

    let previous: string[] = []
    for (const name of migrationsWithCheck) {
      const current = migrationAuditActions(readFileSync(`${root}/packages/db/drizzle/${name}`, 'utf8')).sort()
      // 单调增长：当前集合是前一份的超集（新增动作只会 ADD，不会移除）。
      for (const action of previous) {
        expect(current, `${name} 移除了 ${action}`).toContain(action)
      }
      previous = current
    }
    expect(previous).toEqual([...AUDIT_ACTIONS].sort())
  })

  it('ensure-audit-action-constraint.ts 不再内联手抄，且重建走 NOT VALID + VALIDATE', () => {
    expect(ensureSource).toContain("AUDIT_ACTIONS } from '@bailian-studio/generation-repository'")
    // 脚本里不应再有手抄的完整动作列表（含 auth.register 的数组字面量）。
    expect(ensureSource).not.toContain("'auth.register'")
    expect(ensureSource).toContain('not valid')
    expect(ensureSource).toContain('validate constraint audit_logs_action_check')
  })
})
