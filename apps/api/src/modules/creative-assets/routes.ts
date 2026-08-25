import { Elysia } from 'elysia'
import { z } from 'zod'
import {
  CreateCreativeAssetReferenceSchema,
  CreateCreativeAssetSchema,
  CreateCreativeAssetVersionSchema,
  CreateCreativeAssetVersionFromGenerationSchema,
  CreateCreativeProjectSchema,
  CreativeAssetTypeSchema,
  CreativeAssetVersionStatusSchema,
  CreativeProjectStatusSchema,
  validateInput,
} from '@bailian-studio/shared'
import { CreativeAssetRepositoryError } from '@bailian-studio/creative-asset-repository'
import type {
  CreativeAssetDetail,
  CreativeAssetPreviewSource,
  CreativeAssetReference,
  CreativeAssetSummary,
  CreativeProjectDetail,
} from '@bailian-studio/creative-asset-repository'
import {
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  type StorageAdapter,
} from '@bailian-studio/storage'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'

const ProjectIdParamsSchema = z.object({ projectId: z.string().trim().min(1).max(256) }).strict()
const AssetIdParamsSchema = z.object({ assetId: z.string().trim().min(1).max(256) }).strict()
const VersionIdParamsSchema = z.object({ versionId: z.string().trim().min(1).max(256) }).strict()
const ReferenceIdParamsSchema = z.object({ referenceId: z.string().trim().min(1).max(256) }).strict()

const ListProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  q: z.string().trim().min(1).max(120).optional(),
}).strict()

const UpdateProjectSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2_000).optional(),
  status: CreativeProjectStatusSchema.optional(),
}).strict()

const AttachAssetSchema = z.object({
  assetId: z.string().trim().min(1).max(256),
  sortOrder: z.number().int().nonnegative().max(1_000_000).optional(),
}).strict()

const CreateAssetRequestSchema = CreateCreativeAssetSchema.extend({
  projectId: z.string().trim().min(1).max(256).optional(),
})

const ListAssetsQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(256).optional(),
  type: CreativeAssetTypeSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict()

const CreateVersionBodySchema = CreateCreativeAssetVersionSchema.omit({ assetId: true })
const AddReferenceBodySchema = CreateCreativeAssetReferenceSchema.omit({ assetVersionId: true })
const TransitionVersionBodySchema = z.object({
  status: CreativeAssetVersionStatusSchema,
}).strict()

async function resolvePreviewSource(source: CreativeAssetPreviewSource, storage: StorageAdapter) {
  let url: string | undefined
  if (source.storageKey !== undefined && source.storageProvider === storage.provider) {
    url = await storage.createReadUrl({ key: source.storageKey, expiresInSeconds: 3600 })
  } else if (source.storageKey === undefined) {
    url = source.storageUrl ?? source.originalUrl
  }

  let thumbnailUrl: string | undefined
  if (
    source.thumbnailStatus === 'ready'
    && source.thumbnailStorageKey !== undefined
    && source.thumbnailStorageProvider === storage.provider
  ) {
    try {
      thumbnailUrl = await storage.createReadUrl({ key: source.thumbnailStorageKey, expiresInSeconds: 3600 })
    } catch {
      thumbnailUrl = undefined
    }
  } else if (
    url !== undefined
    && source.storageKey !== undefined
    && source.storageProvider === storage.provider
    && storage.provider === 'oss'
    && (source.kind === 'image' || source.kind === 'video')
  ) {
    thumbnailUrl = await storage.createReadUrl({
      key: source.storageKey,
      expiresInSeconds: 3600,
      process: source.kind === 'image' ? OSS_IMAGE_THUMBNAIL_PROCESS : OSS_VIDEO_SNAPSHOT_PROCESS,
    })
  }

  return {
    userAssetId: source.userAssetId,
    kind: source.kind,
    ...(url === undefined ? {} : { url }),
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    ...(source.thumbnailStatus === undefined ? {} : { thumbnailStatus: source.thumbnailStatus }),
  }
}

async function toPublicSummary(summary: CreativeAssetSummary, storage: StorageAdapter) {
  const { previewSource, ...publicSummary } = summary
  return {
    ...publicSummary,
    ...(previewSource === undefined ? {} : { preview: await resolvePreviewSource(previewSource, storage) }),
  }
}

async function toPublicReference(reference: CreativeAssetReference, storage: StorageAdapter) {
  const { previewSource, ...publicReference } = reference
  return {
    ...publicReference,
    ...(previewSource === undefined ? {} : { preview: await resolvePreviewSource(previewSource, storage) }),
  }
}

async function toPublicDetail(asset: CreativeAssetDetail, storage: StorageAdapter) {
  const summary = await toPublicSummary(asset, storage)
  return {
    ...summary,
    projects: asset.projects,
    versions: await Promise.all(asset.versions.map(async version => ({
      ...version,
      references: await Promise.all(version.references.map(reference => toPublicReference(reference, storage))),
    }))),
  }
}

async function toPublicProject(project: CreativeProjectDetail, storage: StorageAdapter) {
  return {
    ...project,
    assets: await Promise.all(project.assets.map(asset => toPublicSummary(asset, storage))),
  }
}

function requireProject(
  deps: ApiDependencies,
  userId: string,
  projectId: string,
) {
  return deps.creativeAssetRepository.getProject({ userId, projectId }).then(project => {
    if (project === undefined) {
      throw new CreativeAssetRepositoryError('CREATIVE_PROJECT_NOT_FOUND', `Creative project not found: ${projectId}`)
    }
    return project
  })
}

export function createCreativeAssetRoutes(deps: ApiDependencies) {
  return new Elysia()
    .get('/api/creative/projects', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListProjectsQuerySchema, query)
      const page = await deps.creativeAssetRepository.listProjects({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.q !== undefined ? { query: input.q } : {}),
      })
      return { success: true, data: page }
    })
    .post('/api/creative/projects', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateCreativeProjectSchema, body)
      const project = await deps.creativeAssetRepository.createProject({ ...input, userId: user.id })
      return { success: true, data: { project: await toPublicProject(project, deps.storage) } }
    })
    .get('/api/creative/projects/:projectId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { projectId } = validateInput(ProjectIdParamsSchema, params)
      const project = await requireProject(deps, user.id, projectId)
      return { success: true, data: { project: await toPublicProject(project, deps.storage) } }
    })
    .patch('/api/creative/projects/:projectId', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { projectId } = validateInput(ProjectIdParamsSchema, params)
      const input = validateInput(UpdateProjectSchema, body)
      const project = await deps.creativeAssetRepository.updateProject({
        userId: user.id,
        projectId,
        patch: input,
      })
      return { success: true, data: { project: await toPublicProject(project, deps.storage) } }
    })
    .post('/api/creative/projects/:projectId/assets', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { projectId } = validateInput(ProjectIdParamsSchema, params)
      const input = validateInput(AttachAssetSchema, body)
      const asset = await deps.creativeAssetRepository.attachAsset({
        userId: user.id,
        projectId,
        assetId: input.assetId,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .delete('/api/creative/projects/:projectId/assets/:assetId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { projectId, assetId } = validateInput(ProjectIdParamsSchema.merge(AssetIdParamsSchema), params)
      const project = await deps.creativeAssetRepository.detachAsset({ userId: user.id, projectId, assetId })
      return { success: true, data: { project: await toPublicProject(project, deps.storage) } }
    })
    .get('/api/creative/assets', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListAssetsQuerySchema, query)
      const page = await deps.creativeAssetRepository.listAssets({
        userId: user.id,
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.q !== undefined ? { query: input.q } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return {
        success: true,
        data: {
          ...page,
          items: await Promise.all(page.items.map(item => toPublicSummary(item, deps.storage))),
        },
      }
    })
    .post('/api/creative/assets', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateAssetRequestSchema, body)
      const asset = await deps.creativeAssetRepository.createAsset({ ...input, userId: user.id })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .get('/api/creative/assets/:assetId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { assetId } = validateInput(AssetIdParamsSchema, params)
      const asset = await deps.creativeAssetRepository.getAsset({ userId: user.id, assetId })
      if (asset === undefined) {
        throw new CreativeAssetRepositoryError('CREATIVE_ASSET_NOT_FOUND', `Creative asset not found: ${assetId}`)
      }
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .post('/api/creative/assets/:assetId/archive', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { assetId } = validateInput(AssetIdParamsSchema, params)
      const asset = await deps.creativeAssetRepository.archiveAsset({ userId: user.id, assetId })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .post('/api/creative/assets/:assetId/versions', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { assetId } = validateInput(AssetIdParamsSchema, params)
      const input = validateInput(CreateVersionBodySchema, body)
      const asset = await deps.creativeAssetRepository.createVersion({ ...input, assetId, userId: user.id })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .post('/api/creative/assets/:assetId/versions/from-generation', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { assetId } = validateInput(AssetIdParamsSchema, params)
      const input = validateInput(CreateCreativeAssetVersionFromGenerationSchema, body)
      const asset = await deps.creativeAssetRepository.createVersionFromGeneration({ ...input, assetId, userId: user.id })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .post('/api/creative/assets/versions/:versionId/references', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { versionId } = validateInput(VersionIdParamsSchema, params)
      const input = validateInput(AddReferenceBodySchema, body)
      const asset = await deps.creativeAssetRepository.addReference({ ...input, assetVersionId: versionId, userId: user.id })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .delete('/api/creative/assets/versions/:versionId/references/:referenceId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { versionId, referenceId } = validateInput(VersionIdParamsSchema.merge(ReferenceIdParamsSchema), params)
      const asset = await deps.creativeAssetRepository.removeReference({
        userId: user.id,
        assetVersionId: versionId,
        referenceId,
      })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
    .post('/api/creative/assets/versions/:versionId/status', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { versionId } = validateInput(VersionIdParamsSchema, params)
      const input = validateInput(TransitionVersionBodySchema, body)
      const asset = await deps.creativeAssetRepository.transitionVersion({
        userId: user.id,
        assetVersionId: versionId,
        status: input.status,
      })
      return { success: true, data: { asset: await toPublicDetail(asset, deps.storage) } }
    })
}
