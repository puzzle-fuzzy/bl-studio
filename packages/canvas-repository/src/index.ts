import {
  CanvasSnapshotSchema,
  type CanvasDocument,
  type CanvasDocumentSummary,
  type CanvasSnapshot,
  type CanvasVersion,
} from '@bailian-studio/canvas-contracts'
import {
  canvasDocumentVersions,
  canvasDocuments,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
} from '@bailian-studio/db'
import { and, desc, eq } from 'drizzle-orm'

export const CANVAS_REPOSITORY_ERROR_CODES = [
  'CANVAS_NOT_FOUND',
  'CANVAS_REVISION_CONFLICT',
  'CANVAS_VERSION_NOT_FOUND',
  'CANVAS_DATABASE_ERROR',
] as const

export type CanvasRepositoryErrorCode = typeof CANVAS_REPOSITORY_ERROR_CODES[number]

export class CanvasRepositoryError extends Error {
  readonly code: CanvasRepositoryErrorCode
  readonly details?: unknown

  constructor(code: CanvasRepositoryErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'CanvasRepositoryError'
    this.code = code
    this.details = details
  }
}

export interface CanvasRepository {
  listDocuments(input: { userId: string; limit?: number }): Promise<{ items: CanvasDocumentSummary[] }>
  createDocument(input: { userId: string; title?: string; snapshot?: CanvasSnapshot; now?: Date }): Promise<CanvasDocument>
  getDocument(input: { userId: string; documentId: string }): Promise<CanvasDocument | undefined>
  saveDocument(input: {
    userId: string
    documentId: string
    expectedRevision: number
    snapshot: CanvasSnapshot
    title?: string
    now?: Date
  }): Promise<CanvasDocument>
  listVersions(input: { userId: string; documentId: string; limit?: number }): Promise<CanvasVersion[]>
  restoreVersion(input: {
    userId: string
    documentId: string
    versionId: string
    expectedRevision: number
    now?: Date
  }): Promise<CanvasDocument>
}

const DEFAULT_TITLE = '未命名画布'
const DEFAULT_SNAPSHOT: CanvasSnapshot = { nodes: [], edges: [] }

function limitOf(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(max, Math.trunc(value)))
}

function snapshotOf(value: unknown): CanvasSnapshot {
  return CanvasSnapshotSchema.parse(value)
}

function iso(value: Date): string {
  return value.toISOString()
}

function toSummary(row: typeof canvasDocuments.$inferSelect): CanvasDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    updatedAt: iso(row.updatedAt),
  }
}

function toDocument(
  row: typeof canvasDocuments.$inferSelect,
  currentVersionId: string,
): CanvasDocument {
  return {
    ...toSummary(row),
    snapshot: snapshotOf(row.currentSnapshotJson),
    createdAt: iso(row.createdAt),
    currentVersionId,
  }
}

function toVersion(row: typeof canvasDocumentVersions.$inferSelect): CanvasVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    snapshot: snapshotOf(row.snapshotJson),
    createdAt: iso(row.createdAt),
  }
}

function asRepositoryError(error: unknown): CanvasRepositoryError {
  if (error instanceof CanvasRepositoryError) return error
  return new CanvasRepositoryError(
    'CANVAS_DATABASE_ERROR',
    error instanceof Error ? error.message : 'Canvas database operation failed',
  )
}

export function createCanvasRepository(db: BailianStudioDb): CanvasRepository {
  async function currentVersionId(
    executor: BailianStudioDb | BailianStudioDbTransaction,
    documentId: string,
    revision: number,
  ): Promise<string> {
    const [row] = await executor
      .select({ id: canvasDocumentVersions.id })
      .from(canvasDocumentVersions)
      .where(and(
        eq(canvasDocumentVersions.documentId, documentId),
        eq(canvasDocumentVersions.version, revision),
      ))
      .limit(1)
    if (row === undefined) {
      throw new CanvasRepositoryError('CANVAS_DATABASE_ERROR', 'Canvas current version is missing')
    }
    return row.id
  }

  async function readDocument(
    executor: BailianStudioDb | BailianStudioDbTransaction,
    userId: string,
    documentId: string,
  ): Promise<CanvasDocument | undefined> {
    const [row] = await executor
      .select()
      .from(canvasDocuments)
      .where(and(eq(canvasDocuments.id, documentId), eq(canvasDocuments.userId, userId)))
      .limit(1)
    if (row === undefined) return undefined
    return toDocument(row, await currentVersionId(executor, row.id, row.revision))
  }

  async function saveSnapshot(
    transaction: BailianStudioDbTransaction,
    input: {
      userId: string
      documentId: string
      expectedRevision: number
      snapshot: CanvasSnapshot
      title?: string
      now: Date
    },
  ): Promise<CanvasDocument> {
    const snapshot = snapshotOf(input.snapshot)
    const nextRevision = input.expectedRevision + 1
    const [row] = await transaction
      .update(canvasDocuments)
      .set({
        revision: nextRevision,
        currentSnapshotJson: snapshot,
        updatedBy: input.userId,
        updatedAt: input.now,
        ...(input.title !== undefined ? { title: input.title } : {}),
      })
      .where(and(
        eq(canvasDocuments.id, input.documentId),
        eq(canvasDocuments.userId, input.userId),
        eq(canvasDocuments.revision, input.expectedRevision),
      ))
      .returning()

    if (row === undefined) {
      const existing = await readDocument(transaction, input.userId, input.documentId)
      if (existing === undefined) {
        throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas not found: ${input.documentId}`)
      }
      throw new CanvasRepositoryError(
        'CANVAS_REVISION_CONFLICT',
        `Canvas revision conflict: expected ${input.expectedRevision}, current ${existing.revision}`,
        { expectedRevision: input.expectedRevision, currentRevision: existing.revision },
      )
    }

    const versionId = `canvas_version_${crypto.randomUUID()}`
    await transaction.insert(canvasDocumentVersions).values({
      id: versionId,
      documentId: row.id,
      userId: input.userId,
      version: nextRevision,
      snapshotJson: snapshot,
      createdBy: input.userId,
      createdAt: input.now,
    })
    return toDocument(row, versionId)
  }

  return {
    async listDocuments({ userId, limit }) {
      try {
        const rows = await db
          .select()
          .from(canvasDocuments)
          .where(eq(canvasDocuments.userId, userId))
          .orderBy(desc(canvasDocuments.updatedAt), desc(canvasDocuments.id))
          .limit(limitOf(limit, 50, 100))
        return { items: rows.map(toSummary) }
      } catch (error) {
        throw asRepositoryError(error)
      }
    },

    async createDocument({ userId, title, snapshot, now = new Date() }) {
      try {
        const documentId = `canvas_${crypto.randomUUID()}`
        const versionId = `canvas_version_${crypto.randomUUID()}`
        const normalizedSnapshot = snapshotOf(snapshot ?? DEFAULT_SNAPSHOT)
        const row = {
          id: documentId,
          userId,
          title: title ?? DEFAULT_TITLE,
          revision: 1,
          currentSnapshotJson: normalizedSnapshot,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        }
        await db.transaction(async (transaction) => {
          await transaction.insert(canvasDocuments).values(row)
          await transaction.insert(canvasDocumentVersions).values({
            id: versionId,
            documentId,
            userId,
            version: 1,
            snapshotJson: normalizedSnapshot,
            createdBy: userId,
            createdAt: now,
          })
        })
        return toDocument(row, versionId)
      } catch (error) {
        throw asRepositoryError(error)
      }
    },

    async getDocument({ userId, documentId }) {
      try {
        return await readDocument(db, userId, documentId)
      } catch (error) {
        throw asRepositoryError(error)
      }
    },

    async saveDocument({ userId, documentId, expectedRevision, snapshot, title, now = new Date() }) {
      try {
        return await db.transaction((transaction) => saveSnapshot(transaction, {
          userId,
          documentId,
          expectedRevision,
          snapshot,
          ...(title !== undefined ? { title } : {}),
          now,
        }))
      } catch (error) {
        throw asRepositoryError(error)
      }
    },

    async listVersions({ userId, documentId, limit }) {
      try {
        const document = await db
          .select({ id: canvasDocuments.id })
          .from(canvasDocuments)
          .where(and(eq(canvasDocuments.id, documentId), eq(canvasDocuments.userId, userId)))
          .limit(1)
        if (document[0] === undefined) {
          throw new CanvasRepositoryError('CANVAS_NOT_FOUND', `Canvas not found: ${documentId}`)
        }
        const rows = await db
          .select()
          .from(canvasDocumentVersions)
          .where(and(
            eq(canvasDocumentVersions.documentId, documentId),
            eq(canvasDocumentVersions.userId, userId),
          ))
          .orderBy(desc(canvasDocumentVersions.version))
          .limit(limitOf(limit, 50, 100))
        return rows.map(toVersion)
      } catch (error) {
        throw asRepositoryError(error)
      }
    },

    async restoreVersion({ userId, documentId, versionId, expectedRevision, now = new Date() }) {
      try {
        return await db.transaction(async (transaction) => {
          const [version] = await transaction
            .select()
            .from(canvasDocumentVersions)
            .where(and(
              eq(canvasDocumentVersions.id, versionId),
              eq(canvasDocumentVersions.documentId, documentId),
              eq(canvasDocumentVersions.userId, userId),
            ))
            .limit(1)
          if (version === undefined) {
            throw new CanvasRepositoryError('CANVAS_VERSION_NOT_FOUND', `Canvas version not found: ${versionId}`)
          }
          return saveSnapshot(transaction, {
            userId,
            documentId,
            expectedRevision,
            snapshot: snapshotOf(version.snapshotJson),
            now,
          })
        })
      } catch (error) {
        throw asRepositoryError(error)
      }
    },
  }
}
