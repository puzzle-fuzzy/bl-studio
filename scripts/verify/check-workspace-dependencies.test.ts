import { describe, expect, it } from 'vitest'
import {
  checkWorkspaceDependencyDeclarations,
  extractWorkspaceImports,
  manifestDeclaresDependency,
} from './check-workspace-dependencies'

describe('workspace dependency declarations', () => {
  it('extracts package roots from static, dynamic, and require imports', () => {
    expect(extractWorkspaceImports(`
      import { db } from '@bailian-studio/db'
      import type { Task } from '@bailian-studio/task-engine/types'
      const lazy = import('@bailian-studio/shared/server')
      const loaded = require('@bailian-studio/storage')
      // import { ignored } from '@bailian-studio/not-real'
    `)).toEqual([
      '@bailian-studio/db',
      '@bailian-studio/task-engine',
      '@bailian-studio/shared',
      '@bailian-studio/storage',
    ])
  })

  it('accepts all supported manifest dependency sections', () => {
    expect(manifestDeclaresDependency({ dependencies: { '@bailian-studio/db': 'workspace:*' } }, '@bailian-studio/db')).toBe(true)
    expect(manifestDeclaresDependency({ devDependencies: { '@bailian-studio/db': 'workspace:*' } }, '@bailian-studio/db')).toBe(true)
    expect(manifestDeclaresDependency({ peerDependencies: { '@bailian-studio/db': 'workspace:*' } }, '@bailian-studio/db')).toBe(true)
    expect(manifestDeclaresDependency({ optionalDependencies: { '@bailian-studio/db': 'workspace:*' } }, '@bailian-studio/db')).toBe(true)
    expect(manifestDeclaresDependency({}, '@bailian-studio/db')).toBe(false)
  })

  it('passes for the current workspace', () => {
    expect(checkWorkspaceDependencyDeclarations()).toEqual([])
  })
})
