import { z } from 'zod'
import {
  CreativeAssetReferenceRoleSchema,
  CreativeAssetTypeSchema,
  CreativeAssetVersionStatusSchema,
  CreativeAssetStatusSchema,
  CreativeProjectStatusSchema,
} from '@bailian-studio/shared'
import type {
  CreateCreativeAssetInput,
  CreateCreativeAssetReferenceInput,
  CreateCreativeAssetVersionInput,
  CreateCreativeAssetVersionFromGenerationInput,
  CreateCreativeProjectInput,
  CreativeAssetReferenceRole,
  CreativeAssetType,
  CreativeAssetVersionStatus,
  CreativeAssetStatus,
  CreativeProjectStatus,
} from '@bailian-studio/shared'
import { unwrapData } from './http'

const RecordSchema = z.record(z.string(), z.unknown())

const CreativeAssetPreviewSchema = z.object({
  userAssetId: z.string(),
  kind: z.enum(['image', 'video', 'audio']),
  url: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailStatus: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
})

const CreativeProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: CreativeProjectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreativeProjectAssetMembershipSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  assetId: z.string(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreativeAssetReferenceSchema = z.object({
  id: z.string(),
  assetVersionId: z.string(),
  userAssetId: z.string(),
  role: CreativeAssetReferenceRoleSchema,
  position: z.number().int().nonnegative(),
  metadata: RecordSchema,
  preview: CreativeAssetPreviewSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreativeAssetVersionSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  sourceGenerationId: z.string().optional(),
  version: z.number().int().positive(),
  status: CreativeAssetVersionStatusSchema,
  semanticSpec: RecordSchema,
  generationRecipe: RecordSchema,
  notes: z.string().optional(),
  references: z.array(CreativeAssetReferenceSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreativeAssetLatestVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  status: CreativeAssetVersionStatusSchema,
})

const CreativeAssetSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: CreativeAssetTypeSchema,
  name: z.string(),
  description: z.string(),
  status: CreativeAssetStatusSchema,
  metadata: RecordSchema,
  latestVersion: CreativeAssetLatestVersionSchema.optional(),
  approvedVersionId: z.string().optional(),
  preview: CreativeAssetPreviewSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreativeAssetDetailSchema = CreativeAssetSummarySchema.extend({
  projects: z.array(CreativeProjectAssetMembershipSchema),
  versions: z.array(CreativeAssetVersionSchema),
})

const CreativeProjectDetailSchema = CreativeProjectSchema.extend({
  assets: z.array(CreativeAssetSummarySchema),
})

export const CreativeProjectResponseSchema = z.object({ project: CreativeProjectDetailSchema })
export const CreativeProjectListResponseSchema = z.object({
  items: z.array(CreativeProjectSchema),
  nextCursor: z.string().optional(),
})
export const CreativeAssetResponseSchema = z.object({ asset: CreativeAssetDetailSchema })
export const CreativeAssetListResponseSchema = z.object({
  items: z.array(CreativeAssetSummarySchema),
  nextCursor: z.string().optional(),
})

export type CreativeProject = z.infer<typeof CreativeProjectSchema>
export type CreativeProjectAssetMembership = z.infer<typeof CreativeProjectAssetMembershipSchema>
export type CreativeProjectDetail = z.infer<typeof CreativeProjectDetailSchema>
export type CreativeAssetReference = z.infer<typeof CreativeAssetReferenceSchema>
export type CreativeAssetPreview = z.infer<typeof CreativeAssetPreviewSchema>
export type CreativeAssetVersion = z.infer<typeof CreativeAssetVersionSchema>
export type CreativeAssetSummary = z.infer<typeof CreativeAssetSummarySchema>
export type CreativeAssetDetail = z.infer<typeof CreativeAssetDetailSchema>
export type CreativeProjectListResult = z.infer<typeof CreativeProjectListResponseSchema>
export type CreativeAssetListResult = z.infer<typeof CreativeAssetListResponseSchema>

export type CreateCreativeProjectRequest = CreateCreativeProjectInput
export type UpdateCreativeProjectRequest = {
  title?: string
  description?: string
  status?: CreativeProjectStatus
}
export type AttachCreativeAssetRequest = {
  assetId: string
  sortOrder?: number
}
export type CreateCreativeAssetRequest = CreateCreativeAssetInput & {
  projectId?: string
}
export type CreateCreativeAssetVersionRequest = Omit<CreateCreativeAssetVersionInput, 'assetId'>
export type CreateCreativeAssetVersionFromGenerationRequest = CreateCreativeAssetVersionFromGenerationInput
export type AddCreativeAssetReferenceRequest = Omit<CreateCreativeAssetReferenceInput, 'assetVersionId' | 'position' | 'metadata'> & {
  position?: number
  metadata?: CreateCreativeAssetReferenceInput['metadata']
}
export type TransitionCreativeAssetVersionRequest = {
  status: CreativeAssetVersionStatus
}

export interface ListCreativeProjectsParams {
  limit?: number
  cursor?: string
  q?: string
}

export interface ListCreativeAssetsParams {
  projectId?: string
  type?: CreativeAssetType
  q?: string
  limit?: number
  cursor?: string
}

export interface CreativeAssetClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

export interface CreativeAssetApiClient {
  listCreativeProjects(params?: ListCreativeProjectsParams): Promise<CreativeProjectListResult>
  createCreativeProject(input: CreateCreativeProjectRequest): Promise<CreativeProjectDetail>
  getCreativeProject(projectId: string): Promise<CreativeProjectDetail>
  updateCreativeProject(projectId: string, input: UpdateCreativeProjectRequest): Promise<CreativeProjectDetail>
  attachCreativeAssetToProject(projectId: string, input: AttachCreativeAssetRequest): Promise<CreativeAssetDetail>
  detachCreativeAssetFromProject(projectId: string, assetId: string): Promise<CreativeProjectDetail>
  listCreativeAssets(params?: ListCreativeAssetsParams): Promise<CreativeAssetListResult>
  createCreativeAsset(input: CreateCreativeAssetRequest): Promise<CreativeAssetDetail>
  getCreativeAsset(assetId: string): Promise<CreativeAssetDetail>
  archiveCreativeAsset(assetId: string): Promise<CreativeAssetDetail>
  createCreativeAssetVersion(assetId: string, input: CreateCreativeAssetVersionRequest): Promise<CreativeAssetDetail>
  addCreativeAssetReference(versionId: string, input: AddCreativeAssetReferenceRequest): Promise<CreativeAssetDetail>
  transitionCreativeAssetVersion(versionId: string, input: TransitionCreativeAssetVersionRequest): Promise<CreativeAssetDetail>
  createCreativeAssetVersionFromGeneration(assetId: string, input: CreateCreativeAssetVersionFromGenerationRequest): Promise<CreativeAssetDetail>
}

function queryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, string | number | undefined>)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query.length === 0 ? '' : `?${query}`
}

function jsonInit(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  }
}

export function createCreativeAssetClient(options: CreativeAssetClientOptions): CreativeAssetApiClient {
  const fetchImpl = options.fetch ?? fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  return {
    async listCreativeProjects(params = {}) {
      return unwrapData(
        `${base}/api/creative/projects${queryString(params)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreativeProjectListResponseSchema,
      )
    },

    async createCreativeProject(input) {
      const data = await unwrapData(
        `${base}/api/creative/projects`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeProjectResponseSchema,
      )
      return data.project
    },

    async getCreativeProject(projectId) {
      const data = await unwrapData(
        `${base}/api/creative/projects/${encodeURIComponent(projectId)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreativeProjectResponseSchema,
      )
      return data.project
    },

    async updateCreativeProject(projectId, input) {
      const data = await unwrapData(
        `${base}/api/creative/projects/${encodeURIComponent(projectId)}`,
        jsonInit('PATCH', input),
        fetchImpl,
        CreativeProjectResponseSchema,
      )
      return data.project
    },

    async attachCreativeAssetToProject(projectId, input) {
      const data = await unwrapData(
        `${base}/api/creative/projects/${encodeURIComponent(projectId)}/assets`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async detachCreativeAssetFromProject(projectId, assetId) {
      const data = await unwrapData(
        `${base}/api/creative/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
        { method: 'DELETE', credentials: 'include' },
        fetchImpl,
        CreativeProjectResponseSchema,
      )
      return data.project
    },

    async listCreativeAssets(params = {}) {
      return unwrapData(
        `${base}/api/creative/assets${queryString(params)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreativeAssetListResponseSchema,
      )
    },

    async createCreativeAsset(input) {
      const data = await unwrapData(
        `${base}/api/creative/assets`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async getCreativeAsset(assetId) {
      const data = await unwrapData(
        `${base}/api/creative/assets/${encodeURIComponent(assetId)}`,
        { method: 'GET', credentials: 'include' },
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async archiveCreativeAsset(assetId) {
      const data = await unwrapData(
        `${base}/api/creative/assets/${encodeURIComponent(assetId)}/archive`,
        { method: 'POST', credentials: 'include' },
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async createCreativeAssetVersion(assetId, input) {
      const data = await unwrapData(
        `${base}/api/creative/assets/${encodeURIComponent(assetId)}/versions`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async createCreativeAssetVersionFromGeneration(assetId, input) {
      const data = await unwrapData(
        `${base}/api/creative/assets/${encodeURIComponent(assetId)}/versions/from-generation`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async addCreativeAssetReference(versionId, input) {
      const data = await unwrapData(
        `${base}/api/creative/assets/versions/${encodeURIComponent(versionId)}/references`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },

    async transitionCreativeAssetVersion(versionId, input) {
      const data = await unwrapData(
        `${base}/api/creative/assets/versions/${encodeURIComponent(versionId)}/status`,
        jsonInit('POST', input),
        fetchImpl,
        CreativeAssetResponseSchema,
      )
      return data.asset
    },
  }
}

export {
  CreativeAssetReferenceRoleSchema,
  CreativeAssetStatusSchema,
  CreativeAssetTypeSchema,
  CreativeAssetVersionStatusSchema,
  CreativeProjectStatusSchema,
}
export type {
  CreativeAssetReferenceRole,
  CreativeAssetStatus,
  CreativeAssetType,
  CreativeAssetVersionStatus,
  CreativeProjectStatus,
}
