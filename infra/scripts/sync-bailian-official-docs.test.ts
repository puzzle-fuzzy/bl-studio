import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import {
  discoverOfficialDocuments,
  htmlToOfficialMarkdown,
  parseOfficialDocumentHtml,
  parseOfficialNavigationResponse,
} from './lib/official-bailian-documents'
import { sourceDocumentFrom, syncOfficialDocuments, verifyOfficialSnapshot } from './sync-bailian-official-docs'

describe('official Bailian document synchronization primitives', () => {
  it('discovers only valid documents below the trusted model API root', () => {
    const root = parseOfficialNavigationResponse({
      code: 200,
      data: {
        Data: JSON.stringify({
          title: 'root',
          children: [{
            title: 'API参考（模型）',
            alias: '/model-studio/model-api-reference',
            children: [{
              id: 3049634,
              title: '万相3.0-视频生成',
              url: '/zh/model-studio/wan3',
              validDocument: true,
              children: [],
            }],
          }],
        }),
      },
    })

    const registry = discoverOfficialDocuments(root, {
      endpoint: 'https://bailian.console.aliyun.com/data/api.json',
      action: 'MenuPath',
      product: 'DocHelpService',
      region: 'cn-hangzhou',
      nodeId: '2400256',
      website: 'cn',
      language: 'zh',
      rootAliases: ['/model-studio/model-api-reference'],
      minimumDocumentCount: 1,
    })

    expect(registry.documents).toEqual([expect.objectContaining({
      nodeId: 3049634,
      url: 'https://help.aliyun.com/zh/model-studio/wan3',
      path: '万相3.0-视频生成/3049634-万相3.0-视频生成.md',
    })])
  })

  it('rejects untrusted official document URLs', () => {
    const root = parseOfficialNavigationResponse({
      code: 200,
      data: { Data: JSON.stringify({ title: 'root', children: [{
        title: 'API参考（模型）',
        alias: '/model-studio/model-api-reference',
        children: [{
          id: 1,
          title: 'bad',
          url: 'https://evil.example/bad',
          validDocument: true,
          children: [],
        }],
      }] }) },
    })

    expect(() => discoverOfficialDocuments(root, { ...{
      endpoint: 'https://bailian.console.aliyun.com/data/api.json',
      action: 'MenuPath',
      product: 'DocHelpService',
      region: 'cn-hangzhou',
      nodeId: '2400256',
      website: 'cn',
      language: 'zh',
      rootAliases: ['/model-studio/model-api-reference'],
      minimumDocumentCount: 1,
    }})).toThrow('trusted Aliyun Help URL')
  })

  it('rejects bare relative document URLs instead of silently rebasing them', () => {
    const root = parseOfficialNavigationResponse({
      code: 200,
      data: { Data: JSON.stringify({ title: 'root', children: [{
        title: 'API参考（模型）',
        alias: '/model-studio/model-api-reference',
        children: [{
          id: 2,
          title: 'bad',
          url: 'wan3',
          validDocument: true,
          children: [],
        }],
      }] }) },
    })

    expect(() => discoverOfficialDocuments(root, { ...{
      endpoint: 'https://bailian.console.aliyun.com/data/api.json',
      action: 'MenuPath',
      product: 'DocHelpService',
      region: 'cn-hangzhou',
      nodeId: '2400256',
      website: 'cn',
      language: 'zh',
      rootAliases: ['/model-studio/model-api-reference'],
      minimumDocumentCount: 1,
    }})).toThrow()
  })

  it('parses SSR document payloads and converts tables/code to markdown', () => {
    const page = parseOfficialDocumentHtml(`<script>window.__ICE_PAGE_PROPS__=${JSON.stringify({
      docDetailData: { storeData: { data: {
        alias: '/wan3',
        content: '<h1>Wan 3</h1><table><tr><th>参数</th><th>值</th></tr><tr><td>duration</td><td>5</td></tr></table><pre><code class="language-json">{"duration":5}</code></pre>',
        docTitle: 'Wan 3',
        lastModifiedTime: 1775510400000,
        nodeId: 3049634,
        path: '/model-studio/wan3',
        title: 'Wan 3',
        version: 1,
      } } },
    })}</script>`)

    const markdown = htmlToOfficialMarkdown(page.content)
    expect(page.nodeId).toBe(3049634)
    expect(markdown).toContain('# Wan 3')
    expect(markdown).toContain('| 参数 | 值 |')
    expect(markdown).toContain('```json')
    expect(markdown).toContain('{"duration":5}')
  })

  it('records a content hash for the later AI manifest handoff', () => {
    const source = sourceDocumentFrom({
      path: '视频生成/3049634-Wan 3.md',
      nodeId: 3049634,
      url: 'https://help.aliyun.com/zh/model-studio/wan3',
      navigationPath: ['API参考（模型）', '视频生成', 'Wan 3'],
    }, {
      alias: '/wan3',
      content: '<p>hello</p>',
      docTitle: 'Wan 3',
      lastModifiedTime: 1775510400000,
      nodeId: 3049634,
      path: '/model-studio/wan3',
      title: 'Wan 3',
      version: 1,
    }, '# hello\n', '2026-08-08T00:00:00.000Z')

    expect(source).toMatchObject({
      nodeId: 3049634,
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      bytes: 8,
      importedAt: '2026-08-08T00:00:00.000Z',
    })
  })

  it('persists each successful document before a later fetch fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bl-studio-doc-sync-'))
    const paths = {
      root,
      officialRoot: root,
      rawRoot: join(root, 'raw'),
      registryPath: join(root, 'registry.json'),
      syncStatePath: join(root, 'sync-state.json'),
    }
    const registry = {
      schemaVersion: 1 as const,
      source: 'https://help.aliyun.com/zh/model-studio' as const,
      navigation: {
        endpoint: 'https://bailian.console.aliyun.com/data/api.json',
        action: 'MenuPath' as const,
        product: 'DocHelpService' as const,
        region: 'cn-hangzhou' as const,
        nodeId: '2400256',
        website: 'cn' as const,
        language: 'zh' as const,
        rootAliases: ['/model-studio/model-api-reference'],
        minimumDocumentCount: 1,
      },
      documents: [
        {
          path: '视频生成/3049634-万相3.0-视频生成.md',
          nodeId: 3049634,
          url: 'https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference',
          navigationPath: ['API参考（模型）', '视频生成', '万相3.0-视频生成'],
        },
        {
          path: '视频生成/3046321-爱诗-视频对口型.md',
          nodeId: 3046321,
          url: 'https://help.aliyun.com/zh/model-studio/aishi-lip-sync',
          navigationPath: ['API参考（模型）', '视频生成', '爱诗-视频对口型'],
        },
      ],
    }

    try {
      let fetchCount = 0
      await expect(syncOfficialDocuments({
        checkOnly: false,
        registry,
        minimumDocumentCount: 1,
        paths,
        fetchDocument: async mapping => {
          fetchCount += 1
          if (fetchCount === 2) throw new Error(`blocked ${mapping.nodeId}`)
          return {
            alias: '/model-studio/wan3-video-generation-api-reference',
            content: '<h1>万相 3.0</h1>',
            docTitle: '万相 3.0',
            lastModifiedTime: 1786094998000,
            nodeId: 3049634,
            path: '/model-studio/wan3-video-generation-api-reference',
            title: '万相 3.0',
            version: 4,
          }
        },
      })).rejects.toThrow('1/2')

      const firstDocument = await readFile(join(paths.rawRoot, '视频生成/3049634-万相3.0-视频生成.md'), 'utf8')
      expect(firstDocument).toContain('# 万相 3.0')
      const state = JSON.parse(await readFile(paths.syncStatePath, 'utf8')) as Record<string, unknown>
      expect(state).toMatchObject({ status: 'partial', documentCount: 1, expectedDocumentCount: 2 })
      await expect(verifyOfficialSnapshot(paths)).rejects.toThrow('incomplete')

      const resumedFetches: number[] = []
      const resumed = await syncOfficialDocuments({
        checkOnly: false,
        registry,
        minimumDocumentCount: 1,
        paths,
        fetchDocument: async mapping => {
          resumedFetches.push(mapping.nodeId)
          return {
            alias: '/model-studio/aishi-lip-sync',
            content: '<h1>爱诗视频对口型</h1>',
            docTitle: '爱诗视频对口型',
            lastModifiedTime: 1786094998000,
            nodeId: mapping.nodeId,
            path: '/model-studio/aishi-lip-sync',
            title: '爱诗视频对口型',
            version: 1,
          }
        },
      })
      expect(resumedFetches).toEqual([3046321])
      expect(resumed.documentCount).toBe(2)
      await expect(verifyOfficialSnapshot(paths)).resolves.toMatchObject({ documentCount: 2 })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
