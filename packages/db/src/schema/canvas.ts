/** Canvas 文档域：当前画布快照与不可变版本历史。 */

import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './identity'

export const canvasDocuments = pgTable('canvas_documents', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  revision: integer('revision').notNull().default(1),
  currentSnapshotJson: jsonb('current_snapshot_json').$type<Record<string, unknown>>().notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('canvas_documents_revision_check', sql`${table.revision} > 0`),
  index('canvas_documents_user_updated_idx').on(table.userId, table.updatedAt, table.id),
])

export const canvasDocumentVersions = pgTable('canvas_document_versions', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => canvasDocuments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshotJson: jsonb('snapshot_json').$type<Record<string, unknown>>().notNull(),
  createdBy: text('created_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('canvas_document_versions_version_check', sql`${table.version} > 0`),
  uniqueIndex('canvas_document_versions_document_version_idx').on(table.documentId, table.version),
  index('canvas_document_versions_document_version_desc_idx').on(table.documentId, table.version),
  index('canvas_document_versions_user_created_idx').on(table.userId, table.createdAt),
])
