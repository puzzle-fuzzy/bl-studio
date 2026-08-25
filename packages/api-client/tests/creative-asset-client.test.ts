import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function queuedFetch(responses: Response[]) {
  const calls: Array<{ method: string; url: string; body?: string; credentials?: RequestCredentials }> = []
  const core = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(input),
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
      ...(init?.credentials === undefined ? {} : { credentials: init.credentials }),
    })
    const response = responses.shift()
    if (response === undefined) throw new Error('No queued response')
    return response
  }
  return { fetch: Object.assign(core, fetch), calls }
}

const project = {
  id: 'project-1',
  userId: 'user-1',
  title: '夜行者',
  description: '角色与场景素材',
  status: 'active',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const summary = {
  id: 'creative-asset-1',
  userId: 'user-1',
  type: 'character',
  name: '林默',
  description: '男主角',
  status: 'active',
  metadata: { source: 'generated' },
  latestVersion: { id: 'version-1', version: 1, status: 'approved' },
  approvedVersionId: 'version-1',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const detail = {
  ...summary,
  projects: [{
    id: 'membership-1',
    projectId: 'project-1',
    assetId: 'creative-asset-1',
    sortOrder: 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }],
  versions: [{
    id: 'version-1',
    assetId: 'creative-asset-1',
    version: 1,
    status: 'approved',
    semanticSpec: { identity: { name: '林默' } },
    generationRecipe: { modelId: 'qwen-image' },
    references: [{
      id: 'reference-1',
      assetVersionId: 'version-1',
      userAssetId: 'user-image-1',
      role: 'front',
      position: 0,
      metadata: { source: 'uploaded' },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }],
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }],
}

const projectDetail = { ...project, assets: [summary] }

describe('creative asset api client', () => {
  it('exposes typed project, asset, version, and reference operations on the shared client', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: { items: [project], nextCursor: 'project-cursor' } }),
      jsonResponse({ success: true, data: { project: projectDetail } }),
      jsonResponse({ success: true, data: { project: projectDetail } }),
      jsonResponse({ success: true, data: { project: projectDetail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { project: projectDetail } }),
      jsonResponse({ success: true, data: { items: [summary], nextCursor: 'asset-cursor' } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
      jsonResponse({ success: true, data: { asset: detail } }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test/', fetch })

    await expect(client.listCreativeProjects({ limit: 20, cursor: 'p 1', q: '夜行者&1' })).resolves.toMatchObject({
      items: [project],
      nextCursor: 'project-cursor',
    })
    await expect(client.createCreativeProject({ title: '夜行者' })).resolves.toEqual(projectDetail)
    await expect(client.getCreativeProject('project/1')).resolves.toEqual(projectDetail)
    await expect(client.updateCreativeProject('project-1', { status: 'active' })).resolves.toEqual(projectDetail)
    await expect(client.attachCreativeAssetToProject('project-1', { assetId: 'asset-1', sortOrder: 2 })).resolves.toEqual(detail)
    await expect(client.detachCreativeAssetFromProject('project-1', 'asset/1')).resolves.toEqual(projectDetail)
    await expect(client.listCreativeAssets({ projectId: 'project-1', type: 'character', versionStatus: 'candidate', q: '林默', limit: 10 })).resolves.toMatchObject({
      items: [summary],
      nextCursor: 'asset-cursor',
    })
    await expect(client.createCreativeAsset({ type: 'character', name: '林默', projectId: 'project-1' })).resolves.toEqual(detail)
    await expect(client.getCreativeAsset('asset/1')).resolves.toEqual(detail)
    await expect(client.archiveCreativeAsset('asset-1')).resolves.toEqual(detail)
    await expect(client.createCreativeAssetVersion('asset-1', { semanticSpec: {}, generationRecipe: {} })).resolves.toEqual(detail)
    await expect(client.addCreativeAssetReference('version-1', {
      userAssetId: 'user-image-1',
      role: 'front',
      metadata: {},
    })).resolves.toEqual(detail)
    await expect(client.transitionCreativeAssetVersion('version-1', { status: 'approved' })).resolves.toEqual(detail)
    await expect(client.removeCreativeAssetReference('version-1', 'reference-1')).resolves.toEqual(detail)

    expect(calls.map(call => `${call.method} ${call.url}`)).toEqual([
      'GET http://api.test/api/creative/projects?limit=20&cursor=p+1&q=%E5%A4%9C%E8%A1%8C%E8%80%85%261',
      'POST http://api.test/api/creative/projects',
      'GET http://api.test/api/creative/projects/project%2F1',
      'PATCH http://api.test/api/creative/projects/project-1',
      'POST http://api.test/api/creative/projects/project-1/assets',
      'DELETE http://api.test/api/creative/projects/project-1/assets/asset%2F1',
      'GET http://api.test/api/creative/assets?projectId=project-1&type=character&versionStatus=candidate&q=%E6%9E%97%E9%BB%98&limit=10',
      'POST http://api.test/api/creative/assets',
      'GET http://api.test/api/creative/assets/asset%2F1',
      'POST http://api.test/api/creative/assets/asset-1/archive',
      'POST http://api.test/api/creative/assets/asset-1/versions',
      'POST http://api.test/api/creative/assets/versions/version-1/references',
      'POST http://api.test/api/creative/assets/versions/version-1/status',
      'DELETE http://api.test/api/creative/assets/versions/version-1/references/reference-1',
    ])
    expect(calls.every(call => call.credentials === 'include')).toBe(true)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({})
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ title: '夜行者' })
    expect(JSON.parse(calls[3]?.body ?? '{}')).toEqual({ status: 'active' })
    expect(JSON.parse(calls[11]?.body ?? '{}')).toMatchObject({ userAssetId: 'user-image-1', role: 'front' })
  })

  it('collects a stored generation artifact through the dedicated endpoint', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { asset: detail } })])
    const client = createApiClient({ baseUrl: 'http://api.test/', fetch })

    await expect(client.createCreativeAssetVersionFromGeneration('asset/1', {
      sourceGenerationId: 'generation-1',
      semanticSpec: { identity: { name: '林默' } },
      generationRecipe: { source: 'generation' },
      references: [{ artifactId: 'artifact-1', role: 'front', position: 0, metadata: { source: 'generated' } }],
    })).resolves.toEqual(detail)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://api.test/api/creative/assets/asset%2F1/versions/from-generation',
      credentials: 'include',
    })
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({
      sourceGenerationId: 'generation-1',
      references: [{ artifactId: 'artifact-1', role: 'front', position: 0 }],
    })
  })
})
