import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardDirectory = join(
  process.cwd(),
  'deploy/observability/grafana/provisioning/dashboards',
)
const productionComposeFile = join(process.cwd(), 'deploy/docker/compose.prod.yaml')
const productionDeployScript = join(process.cwd(), 'scripts/deploy/deploy-prod.sh')
const observabilityDeployScript = join(process.cwd(), 'scripts/deploy/prod-observability.sh')
const dashboardProviderFile = join(
  process.cwd(),
  'deploy/observability/grafana/provisioning/dashboards/provider.yml',
)

interface DashboardTarget {
  datasource?: { type?: string; uid?: string }
  expr?: string
}

interface DashboardPanel {
  datasource?: { type?: string; uid?: string }
  targets?: DashboardTarget[]
}

interface DashboardDocument {
  uid?: string
  title?: string
  panels?: DashboardPanel[]
}

function readDashboards(): Array<{ file: string; dashboard: DashboardDocument }> {
  return readdirSync(dashboardDirectory)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => ({
      file,
      dashboard: JSON.parse(
        readFileSync(join(dashboardDirectory, file), 'utf8'),
      ) as DashboardDocument,
    }))
}

describe('Grafana observability dashboards', () => {
  it('keeps every versioned dashboard valid and attached to the provisioned Loki datasource', () => {
    const dashboards = readDashboards()
    expect(dashboards.length).toBeGreaterThan(0)

    for (const { file, dashboard } of dashboards) {
      expect(dashboard.uid, file).toBeTruthy()
      expect(dashboard.title, file).toBeTruthy()
      expect(dashboard.panels?.length, file).toBeGreaterThan(0)

      for (const panel of dashboard.panels ?? []) {
        expect(panel.datasource?.type, file).toBe('loki')
        expect(panel.datasource?.uid, file).toBe('lokiuid')
        for (const target of panel.targets ?? []) {
          expect(target.datasource?.type, file).toBe('loki')
          expect(target.datasource?.uid, file).toBe('lokiuid')
          expect(target.expr, file).toBeTruthy()
        }
      }
    }
  })

  it('keeps the audit outbox dashboard tied to the Worker metric contract', () => {
    const dashboard = readDashboards().find(item => item.file === '04-audit-outbox.json')?.dashboard
    expect(dashboard).toBeDefined()

    const expressions = (dashboard?.panels ?? [])
      .flatMap(panel => panel.targets ?? [])
      .map(target => target.expr ?? '')
      .join('\n')

    expect(expressions).toContain('audit_outbox.drained')
    expect(expressions).toContain('audit_outbox.drain_failed')
    expect(expressions).toContain('worker.metrics_snapshot')
    expect(expressions).toContain('unwrap')
  })

  it('keeps the Canvas dashboard tied to stable Worker event fields', () => {
    const dashboard = readDashboards().find(item => item.file === '05-canvas-operations.json')?.dashboard
    expect(dashboard).toBeDefined()

    const expressions = (dashboard?.panels ?? [])
      .flatMap(panel => panel.targets ?? [])
      .map(target => target.expr ?? '')
      .join('\n')

    expect(expressions).toContain('task.duration')
    expect(expressions).toContain('taskType="canvas.execute"')
    expect(expressions).toContain('canvas.node_succeeded')
    expect(expressions).toContain('canvas.node_failed')
    expect(expressions).toContain('canvas.node_generation_queued')
    expect(expressions).toContain('cacheHit')
    expect(expressions).toContain('unwrap durationMs')
  })

  it('keeps versioned dashboards on the production deployment path', () => {
    const productionCompose = readFileSync(productionComposeFile, 'utf8')
    const productionDeployScriptText = readFileSync(productionDeployScript, 'utf8')
    const observabilityDeployScriptText = readFileSync(observabilityDeployScript, 'utf8')
    const dashboardProvider = readFileSync(dashboardProviderFile, 'utf8')

    expect(productionCompose).toContain(
      '../observability/grafana/provisioning:/etc/grafana/provisioning:ro',
    )
    expect(dashboardProvider).toContain(
      'path: /etc/grafana/provisioning/dashboards',
    )
    expect(productionDeployScriptText).toContain(
      'deploy/observability/grafana/ "$DEPLOY_HOST:$REMOTE_DEPLOY/observability/grafana/"',
    )
    expect(observabilityDeployScriptText).toContain(
      'docker compose --env-file $REMOTE_DEPLOY/env/.env.prod --profile observability',
    )
    expect(observabilityDeployScriptText).toContain(
      'OBSERVABILITY_SERVICES="loki alloy grafana monitor"',
    )
    expect(observabilityDeployScriptText).toContain('smoke_observability')
    expect(observabilityDeployScriptText).toContain(
      'http://127.0.0.1:3100/ready',
    )
    expect(observabilityDeployScriptText).toContain(
      'http://127.0.0.1:5300/api/health',
    )
    expect(observabilityDeployScriptText).toContain('grep -Fxq')
    expect(observabilityDeployScriptText).toContain('\\$service')
  })
})
