import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const productionCompose = readFileSync(
  join(repositoryRoot, 'deploy/docker/compose.prod.yaml'),
  'utf8',
)
const productionDeploy = readFileSync(
  join(repositoryRoot, 'scripts/deploy/deploy-prod.sh'),
  'utf8',
)
const migrationDirectory = join(repositoryRoot, 'packages/db/drizzle')

describe('production release contract', () => {
  it('runs the committed migration chain before starting application services', () => {
    expect(productionCompose).toContain(
      'command: ["bun", "x", "drizzle-kit", "migrate", "--config", "packages/db/drizzle.config.ts"]',
    )
    expect(productionDeploy).toContain('bun run verify')
    expect(productionDeploy).toContain('ssh_cmd "$COMPOSE run --rm migrate"')

    const migrationIndex = productionDeploy.indexOf(
      'ssh_cmd "$COMPOSE run --rm migrate"',
    )
    const applicationStartupIndex = productionDeploy.indexOf(
      'ssh_cmd "$COMPOSE up -d --no-build --pull never --scale migrate=0"',
    )

    expect(migrationIndex).toBeGreaterThanOrEqual(0)
    expect(applicationStartupIndex).toBeGreaterThan(migrationIndex)
  })

  it('keeps the Canvas analytics indexes in the committed migration chain', () => {
    const migrations = readdirSync(migrationDirectory)
      .filter(file => file.endsWith('.sql'))
      .map(file => readFileSync(join(migrationDirectory, file), 'utf8'))
      .join('\n')

    expect(migrations).toContain('task_records_canvas_analytics_idx')
    expect(migrations).toContain('generation_records_trace_idx')
  })
})
