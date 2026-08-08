import { describe, expect, it } from 'vitest'
import {
  discoverOfficialDocuments,
  htmlToOfficialMarkdown,
  parseOfficialDocumentHtml,
  parseOfficialNavigationResponse,
} from './lib/official-bailian-documents'
import { sourceDocumentFrom } from './sync-bailian-official-docs'

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
              url: 'https://help.aliyun.com/zh/model-studio/wan3',
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
})
