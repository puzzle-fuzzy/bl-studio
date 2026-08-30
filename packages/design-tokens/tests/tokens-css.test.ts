import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const tokensCss = readFileSync(
  fileURLToPath(new URL('../src/tokens.css', import.meta.url)),
  'utf8',
)
const baseCss = readFileSync(
  fileURLToPath(new URL('../src/base.css', import.meta.url)),
  'utf8',
)

describe('shared CSS tokens', () => {
  it('ships the standard light theme and keeps dark token compatibility', () => {
    expect(tokensCss).toContain('[data-theme="light"]')
    expect(tokensCss).toContain('[data-theme="dark"]')
    expect(tokensCss).toContain('--rb-canvas: #f0efeb')
    expect(tokensCss).toContain('--rb-surface: #fffdfa')
    expect(tokensCss).toContain('--rb-accent: #d95567')
    expect(tokensCss).toContain('--rb-canvas: #111211')
    expect(tokensCss).toContain('--rb-sidebar-fg: #f2f3ee')
    expect(tokensCss).toContain('--rb-fg: #f1f1f1')
    expect(tokensCss).toContain('--rb-accent-fg: #ffffff')
    expect(tokensCss).toContain(':root:not([data-theme="dark"])')
  })

  it('defines the readable typography and workbench layout contract', () => {
    expect(tokensCss).toContain('--rb-font-size-micro: 0.75rem')
    expect(tokensCss).toContain('--rb-font-size-caption: 0.8125rem')
    expect(tokensCss).toContain('--rb-font-size-body: 0.9375rem')
    expect(tokensCss).toContain('--rb-workbench-panel-width: 29rem')
    expect(tokensCss).toContain('--rb-sidebar-collapsed-width: 4.5rem')
    expect(tokensCss).toContain('--rb-sidebar-expanded-width: 16rem')
    expect(tokensCss).toContain('--rb-radius-panel: 14px')
    expect(tokensCss).toContain('--rb-radius-control: 8px')
    expect(tokensCss).toContain('--rb-control-height: 44px')
  })

  it('does not ship selectable decorative themes', () => {
    expect(tokensCss).toContain('--rb-content-max-width: 1660px')
    expect(tokensCss).not.toContain('[data-theme="neumorphism"]')
    expect(tokensCss).not.toContain('[data-theme="korean-minimal"]')
    expect(tokensCss).not.toContain('[data-theme="distill-style"]')
  })

  it('ships the shared application base style contract', () => {
    expect(baseCss).toContain('@import "./tokens.css"')
    expect(baseCss).toContain('min-width: 320px')
    expect(baseCss).toContain('font-family: var(--rb-font-system)')
    expect(baseCss).toContain('line-height: var(--rb-line-height-copy)')
    expect(baseCss).toContain('font: inherit')
    expect(baseCss).toContain('cursor: pointer')
  })
})
