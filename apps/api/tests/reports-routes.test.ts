import { beforeEach, describe, expect, it } from 'vitest'
import type { AdminGalleryRepository, AuditRepository, ContentReportRepository, GenerationRepository } from '@bailian-studio/generation-repository'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { StorageAdapter } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUser: { id: string; role: 'user' | 'admin' } = { id: 'reporter-1', role: 'user' }
const audits: Array<Record<string, unknown>> = []
const hidden: Array<Record<string, unknown>> = []

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUser.id,
  email: `${currentUser.id}@e.test`,
  displayName: null,
  role: currentUser.role,
}))

const report = {
  id: 'report-1',
  generationId: 'generation-1',
  reporterId: 'reporter-1',
  reason: 'unsafe' as const,
  details: '请人工核查',
  status: 'open' as const,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
}

const fakeContentReportRepository = {
  submitContentReport: async (input: { reporterId: string; generationId: string; reason: string; details?: string }) => ({
    ...report,
    reporterId: input.reporterId,
    generationId: input.generationId,
    reason: input.reason as typeof report.reason,
    ...(input.details !== undefined ? { details: input.details } : {}),
  }),
  listContentReports: async () => ({ items: [report] }),
  updateContentReport: async (input: { reportId: string; status: typeof report.status }) => ({
    ...report,
    id: input.reportId,
    status: input.status,
  }),
} as unknown as ContentReportRepository

const fakeGenerationRepository = {
  recordAuditEvent: async (input: Record<string, unknown>) => {
    audits.push(input)
    return {} as never
  },
} as unknown as GenerationRepository

const fakeAuditRepository: AuditRepository = {
  recordAuditEvent: async (input) => {
    audits.push({ ...input })
    return {} as never
  },
}

const fakeAdminGalleryRepository = {
  setGalleryRecordHidden: async (input: Record<string, unknown>) => {
    hidden.push(input)
  },
} as unknown as AdminGalleryRepository

const fakeCreditLedger = {} as CreditLedger
const fakeStorage = {
  provider: 'local' as const,
  keyPrefix: '',
  writeObject: async () => ({ provider: 'local' as const, key: 'unused', byteSize: 0 }),
  createReadUrl: async () => '/unused',
} as StorageAdapter

const app = createTestApp({
  authService: fakeAuthService,
  creditLedger: fakeCreditLedger,
  generationRepository: fakeGenerationRepository,
  auditRepository: fakeAuditRepository,
  contentReportRepository: fakeContentReportRepository,
  adminGalleryRepository: fakeAdminGalleryRepository,
  storage: fakeStorage,
}).app

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(`http://localhost${path}`, { ...init, headers })
}

describe('content report routes', () => {
  beforeEach(() => {
    currentUser = { id: 'reporter-1', role: 'user' }
    audits.length = 0
    hidden.length = 0
  })

  it('submits a report for an authenticated user and records an audit event', async () => {
    const response = await app.handle(request('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ generationId: 'generation-1', reason: 'unsafe', details: '请人工核查' }),
    }))
    const body = await response.json() as { success: boolean; data: { report: { id: string; generationId: string } } }

    expect(response.status).toBe(200)
    expect(body.data.report).toMatchObject({ id: 'report-1', generationId: 'generation-1' })
    expect(audits).toContainEqual(expect.objectContaining({ action: 'content.report.submit', outcome: 'succeeded' }))
  })

  it('keeps report administration admin-only', async () => {
    const response = await app.handle(request('/api/admin/reports'))
    expect(response.status).toBe(403)

    currentUser = { id: 'admin-1', role: 'admin' }
    const adminResponse = await app.handle(request('/api/admin/reports'))
    expect(adminResponse.status).toBe(200)
  })

  it('can resolve a report and hide its target in one audited operation', async () => {
    currentUser = { id: 'admin-1', role: 'admin' }
    const response = await app.handle(request('/api/admin/reports/report-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', hideTarget: true }),
    }))

    expect(response.status).toBe(200)
    expect(hidden).toContainEqual({ recordId: 'generation-1', hidden: true, actorId: 'admin-1' })
    expect(audits).toContainEqual(expect.objectContaining({ action: 'admin.content-report.update', outcome: 'succeeded' }))
  })
})
