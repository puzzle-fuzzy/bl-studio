import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardDirectory = join(
  process.cwd(),
  'deploy/observability/grafana/provisioning/dashboards',
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
})
