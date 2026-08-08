import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export const OFFICIAL_DOCUMENT_SOURCE = 'https://help.aliyun.com/zh/model-studio'

export interface OfficialNavigationConfig {
  endpoint: string
  action: 'MenuPath'
  product: 'DocHelpService'
  region: 'cn-hangzhou'
  nodeId: string
  website: 'cn'
  language: 'zh'
  rootAliases: string[]
  minimumDocumentCount: number
}

export interface OfficialDocumentMapping {
  path: string
  nodeId: number
  url: string
  navigationPath: string[]
  origin?: 'navigation' | 'supplemental'
}

export interface OfficialDocumentRegistry {
  schemaVersion: 1
  source: typeof OFFICIAL_DOCUMENT_SOURCE
  navigation: OfficialNavigationConfig
  documents: OfficialDocumentMapping[]
}

export interface AliyunNavigationNode {
  id?: number
  title: string
  alias?: string
  url?: string
  validDocument?: boolean
  children: AliyunNavigationNode[]
}

export interface AliyunDocumentPage {
  alias: string
  content: string
  docTitle: string
  lastModifiedTime: number
  nodeId: number
  path: string
  title: string
  version: number
}

export const DEFAULT_NAVIGATION_CONFIG: OfficialNavigationConfig = {
  endpoint: 'https://bailian.console.aliyun.com/data/api.json',
  action: 'MenuPath',
  product: 'DocHelpService',
  region: 'cn-hangzhou',
  nodeId: '2400256',
  website: 'cn',
  language: 'zh',
  rootAliases: ['/model-studio/model-api-reference'],
  minimumDocumentCount: 100,
}

/**
 * 模型 API 导航之外、但对后续 Manifest 审核不可缺少的官方文档。
 * 这组路径与 bailian-hub 的 supplemental source 语义一致，尤其保留价格页。
 */
export const SUPPLEMENTAL_DOCUMENTS: OfficialDocumentMapping[] = [
  {
    path: '模型调用价格.md',
    nodeId: 2987148,
    url: 'https://help.aliyun.com/zh/model-studio/model-pricing',
    navigationPath: ['官方补充文档', '模型调用价格'],
    origin: 'supplemental',
  },
  {
    path: '选择模型.md',
    nodeId: 2840914,
    url: 'https://help.aliyun.com/zh/model-studio/models',
    navigationPath: ['官方补充文档', '选择模型'],
    origin: 'supplemental',
  },
  {
    path: '错误码.md',
    nodeId: 2712216,
    url: 'https://help.aliyun.com/zh/model-studio/error-code',
    navigationPath: ['官方补充文档', '错误码'],
    origin: 'supplemental',
  },
]

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label}.${key} must be a non-empty string`)
  }
  return value
}

function requiredInteger(record: Record<string, unknown>, key: string, label: string): number {
  const raw = record[key]
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label}.${key} must be a non-negative integer`)
  }
  return value
}

function trustedHelpUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'help.aliyun.com') {
    throw new TypeError(`official document URL is not a trusted Aliyun Help URL: ${value}`)
  }
  url.hash = ''
  url.search = ''
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function safeDocumentPath(value: string): string {
  const path = value.replaceAll('\\', '/')
  if (
    isAbsolute(path)
    || path.startsWith('/')
    || path.split('/').includes('..')
    || !path.endsWith('.md')
  ) {
    throw new TypeError(`official document path is unsafe: ${path}`)
  }
  return path
}

function sanitizeSegment(value: string, fallback: string): string {
  const replacements: Record<string, string> = {
    '<': '＜',
    '>': '＞',
    ':': '：',
    '"': '”',
    '/': '／',
    '\\': '＼',
    '|': '｜',
    '?': '？',
    '*': '＊',
  }
  const sanitized = [...value.trim()]
    .map(character => replacements[character] ?? (/^[\u0000-\u001f]$/.test(character) ? '' : character))
    .join('')
    .replace(/[. ]+$/g, '')
    .trim()
  const safe = sanitized.length === 0 ? fallback : sanitized
  return [...safe].slice(0, 72).join('')
}

function generatedDocumentPath(nodeId: number, navigationPath: readonly string[]): string {
  const relativePath = navigationPath.slice(1)
  const title = relativePath.at(-1) ?? `document-${nodeId}`
  const group = sanitizeSegment(relativePath[0] ?? '更多', '更多')
  const subgroup = relativePath.length > 2
    ? sanitizeSegment(relativePath[1] ?? '', `group-${nodeId}`)
    : undefined
  const file = `${nodeId}-${sanitizeSegment(title, `document-${nodeId}`)}.md`
  return [group, subgroup, file].filter((segment): segment is string => segment !== undefined).join('/')
}

function parseNavigationNode(value: unknown, label: string): AliyunNavigationNode {
  const record = objectRecord(value, label)
  const children = record.children === undefined
    ? []
    : Array.isArray(record.children)
      ? record.children.map((child, index) => parseNavigationNode(child, `${label}.children[${index}]`))
      : (() => { throw new TypeError(`${label}.children must be an array`) })()
  const id = record.id === undefined ? undefined : requiredInteger(record, 'id', label)
  return {
    ...(id === undefined ? {} : { id }),
    title: requiredString(record, 'title', label).trim(),
    ...(typeof record.alias === 'string' ? { alias: record.alias } : {}),
    ...(typeof record.url === 'string' ? { url: record.url } : {}),
    ...(typeof record.validDocument === 'boolean' ? { validDocument: record.validDocument } : {}),
    children,
  }
}

export function parseOfficialNavigationResponse(value: unknown): AliyunNavigationNode {
  const response = objectRecord(value, 'Aliyun navigation response')
  if (response.code !== 200 && response.code !== '200') {
    throw new Error(`Aliyun navigation endpoint returned code ${String(response.code)}`)
  }
  const data = objectRecord(response.data, 'Aliyun navigation response data')
  const serialized = requiredString(data, 'Data', 'Aliyun navigation response data')
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  }
  catch (error) {
    throw new Error('Aliyun navigation Data is not valid JSON', { cause: error })
  }
  return parseNavigationNode(parsed, 'Aliyun navigation root')
}

function findUniqueRoot(root: AliyunNavigationNode, alias: string): AliyunNavigationNode {
  const matches: AliyunNavigationNode[] = []
  const pending = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.alias === alias) matches.push(node)
    pending.push(...node.children)
  }
  if (matches.length !== 1) {
    throw new Error(`Official navigation root ${alias} matched ${matches.length} node(s)`)
  }
  return matches[0]!
}

export function discoverOfficialDocuments(
  navigationRoot: AliyunNavigationNode,
  config: OfficialNavigationConfig = DEFAULT_NAVIGATION_CONFIG,
): OfficialDocumentRegistry {
  const documents: OfficialDocumentMapping[] = []
  const seenNodeIds = new Set<number>()
  const seenPaths = new Set<string>()

  for (const rootAlias of config.rootAliases) {
    const root = findUniqueRoot(navigationRoot, rootAlias)
    const pending: Array<{ node: AliyunNavigationNode, path: string[] }> = [{ node: root, path: [root.title] }]
    while (pending.length > 0) {
      const current = pending.pop()!
      const { node, path } = current
      for (const child of [...node.children].reverse()) {
        pending.push({ node: child, path: [...path, child.title] })
      }
      if (!node.validDocument || node.id === undefined || node.url === undefined) continue

      const url = trustedHelpUrl(node.url)
      const documentPath = safeDocumentPath(generatedDocumentPath(node.id, path))
      if (seenNodeIds.has(node.id)) throw new Error(`duplicate official document nodeId: ${node.id}`)
      if (seenPaths.has(documentPath)) throw new Error(`duplicate official document path: ${documentPath}`)
      seenNodeIds.add(node.id)
      seenPaths.add(documentPath)
      documents.push({ path: documentPath, nodeId: node.id, url, navigationPath: path })
    }
  }

  documents.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
  if (documents.length < config.minimumDocumentCount) {
    throw new Error(`Official document discovery returned ${documents.length} documents; expected at least ${config.minimumDocumentCount}`)
  }
  return {
    schemaVersion: 1,
    source: OFFICIAL_DOCUMENT_SOURCE,
    navigation: config,
    documents,
  }
}

export async function fetchOfficialNavigation(
  config: OfficialNavigationConfig = DEFAULT_NAVIGATION_CONFIG,
  fetcher: typeof fetch = fetch,
): Promise<AliyunNavigationNode> {
  const endpoint = new URL(config.endpoint)
  endpoint.search = new URLSearchParams({ action: config.action, product: config.product }).toString()
  const body = new URLSearchParams({
    sec_token: '',
    region: config.region,
    params: JSON.stringify({ NodeId: config.nodeId, Website: config.website, Language: config.language }),
  })
  let lastError: unknown
  for (const retryDelay of [0, 1_000, 3_000]) {
    if (retryDelay > 0) await new Promise(resolve => setTimeout(resolve, retryDelay))
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'bl-studio-official-sync/1.0',
        },
        body,
      })
      if (!response.ok) throw new Error(`Aliyun navigation HTTP ${response.status}`)
      return parseOfficialNavigationResponse(await response.json() as unknown)
    }
    catch (error) {
      lastError = error
    }
  }
  throw new Error(`Unable to fetch official Bailian navigation: ${lastError instanceof Error ? lastError.message : String(lastError)}`, { cause: lastError })
}

function documentPageFrom(value: unknown): AliyunDocumentPage {
  const data = objectRecord(value, 'Aliyun document data')
  return {
    alias: requiredString(data, 'alias', 'Aliyun document data'),
    content: requiredString(data, 'content', 'Aliyun document data'),
    docTitle: requiredString(data, 'docTitle', 'Aliyun document data'),
    lastModifiedTime: requiredInteger(data, 'lastModifiedTime', 'Aliyun document data'),
    nodeId: requiredInteger(data, 'nodeId', 'Aliyun document data'),
    path: requiredString(data, 'path', 'Aliyun document data'),
    title: requiredString(data, 'title', 'Aliyun document data'),
    version: requiredInteger(data, 'version', 'Aliyun document data'),
  }
}

export function parseOfficialDocumentResponse(value: unknown): AliyunDocumentPage {
  const response = objectRecord(value, 'Aliyun document response')
  if (response.code !== 200 && response.code !== '200') {
    throw new Error(`Aliyun document endpoint returned code ${String(response.code)}`)
  }
  return documentPageFrom(response.data)
}

export function parseOfficialDocumentHtml(html: string): AliyunDocumentPage {
  const marker = 'window.__ICE_PAGE_PROPS__='
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) throw new Error('Aliyun page does not contain __ICE_PAGE_PROPS__')
  const valueStart = markerIndex + marker.length
  const scriptEnd = html.indexOf('</script>', valueStart)
  if (scriptEnd < 0) throw new Error('Aliyun __ICE_PAGE_PROPS__ script is not terminated')
  const serialized = html.slice(valueStart, scriptEnd).trim().replace(/;$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  }
  catch (error) {
    throw new Error('Aliyun __ICE_PAGE_PROPS__ is not valid JSON', { cause: error })
  }
  const pageProps = objectRecord(parsed, 'Aliyun page props')
  const docDetailData = objectRecord(pageProps.docDetailData, 'Aliyun docDetailData')
  const storeData = objectRecord(docDetailData.storeData, 'Aliyun storeData')
  return documentPageFrom(storeData.data)
}

export async function fetchOfficialDocument(
  mapping: OfficialDocumentMapping,
  fetcher: typeof fetch = fetch,
): Promise<AliyunDocumentPage> {
  const canonicalUrl = new URL(mapping.url)
  const endpoint = new URL('/help/json/document_detail.json', canonicalUrl.origin)
  endpoint.search = new URLSearchParams({
    nodeId: String(mapping.nodeId),
    pageNum: '1',
    pageSize: '20',
    website: 'cn',
    language: 'zh',
  }).toString()

  let lastError: unknown
  for (const retryDelay of [0, 2_000, 10_000]) {
    if (retryDelay > 0) await new Promise(resolve => setTimeout(resolve, retryDelay))
    try {
      const jsonResponse = await fetcher(endpoint, { headers: { accept: 'application/json' } })
      if (jsonResponse.ok) {
        const page = parseOfficialDocumentResponse(await jsonResponse.json() as unknown)
        if (page.nodeId !== mapping.nodeId) throw new Error(`expected node ${mapping.nodeId}, received ${page.nodeId}`)
        return page
      }
      lastError = new Error(`official document endpoint HTTP ${jsonResponse.status}`)
    }
    catch (error) {
      lastError = error
    }

    try {
      // Fall through to the SSR page, which is the same fallback used by bailian-hub.
      const htmlResponse = await fetcher(canonicalUrl, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'user-agent': 'Mozilla/5.0 (compatible; bl-studio-official-sync/1.0)',
        },
      })
      if (!htmlResponse.ok) throw new Error(`official document HTTP ${htmlResponse.status}`)
      const body = await htmlResponse.text()
      if (body.includes('_____tmd_____') || body.includes('验证码')) {
        throw new Error('Aliyun access challenge returned instead of the official document')
      }
      const page = parseOfficialDocumentHtml(body)
      if (page.nodeId !== mapping.nodeId) throw new Error(`expected node ${mapping.nodeId}, received ${page.nodeId}`)
      return page
    }
    catch (error) {
      lastError = error
    }
  }
  throw new Error(`${mapping.path}: unable to fetch official document: ${lastError instanceof Error ? lastError.message : String(lastError)}`, { cause: lastError })
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length))
}

function codeLanguage(node: HTMLElement): string {
  const code = node.querySelector('code')
  const classes = `${node.className} ${code?.className ?? ''}`
  return classes.match(/(?:language-|lang-)([A-Za-z0-9_+.-]+)/)?.[1] ?? ''
}

function markdownTable(node: HTMLElement): string {
  const rows = Array.from(node.querySelectorAll('tr'))
  const matrix: string[][] = []
  for (const [rowIndex, row] of rows.entries()) {
    matrix[rowIndex] ??= []
    let columnIndex = 0
    const cells = Array.from(row.children).filter(child => child.nodeName === 'TD' || child.nodeName === 'TH')
    for (const cell of cells) {
      while (matrix[rowIndex]![columnIndex] !== undefined) columnIndex += 1
      const rowSpan = Math.max(1, Number.parseInt(cell.getAttribute('rowspan') ?? '1', 10) || 1)
      const columnSpan = Math.max(1, Number.parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1)
      const value = (cell.textContent ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\s*\n\s*/g, '<br>')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\|/g, '\\|')
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        matrix[rowIndex + rowOffset] ??= []
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          matrix[rowIndex + rowOffset]![columnIndex + columnOffset] = value
        }
      }
      columnIndex += columnSpan
    }
  }
  const columnCount = Math.max(0, ...matrix.map(row => row.length))
  if (columnCount === 0) return ''
  const renderRow = (row: string[]): string => `| ${Array.from({ length: columnCount }, (_, index) => row[index] ?? '').join(' | ')} |`
  return `\n\n${renderRow(matrix[0] ?? [])}\n| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |\n${matrix.slice(1).map(renderRow).join('\n')}\n\n`
}

function isInsideApiReferenceTable(node: HTMLElement): boolean {
  let current: HTMLElement | null = node
  while (current !== null) {
    if (current.nodeName === 'TABLE') return current.classList.contains('api-reference')
    current = current.parentElement
  }
  return false
}

export function htmlToOfficialMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  turndown.use(gfm)
  turndown.remove(node => ['BUTTON', 'SCRIPT', 'STYLE', 'SVG'].includes(node.nodeName))
  turndown.addRule('aliyun-api-layout-table', {
    filter: node => node.nodeName === 'TABLE' && node.classList.contains('api-reference'),
    replacement(content) {
      return `\n\n${content.trim()}\n\n`
    },
  })
  turndown.addRule('aliyun-data-table', {
    filter: node => node.nodeName === 'TABLE' && !node.classList.contains('api-reference'),
    replacement(_content, node) {
      return markdownTable(node)
    },
  })
  turndown.addRule('aliyun-api-layout-structure', {
    filter: node => (
      ['THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD'].includes(node.nodeName)
      && isInsideApiReferenceTable(node)
    ),
    replacement(content) {
      return `\n\n${content.trim()}\n\n`
    },
  })
  turndown.addRule('aliyun-strikethrough', {
    filter: node => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
    replacement(content) {
      return `~~${content}~~`
    },
  })
  turndown.addRule('aliyun-fenced-code-block', {
    filter: 'pre',
    replacement(_content, node) {
      const value = (node.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(value) + 1))
      return `\n\n${fence}${codeLanguage(node)}\n${value}\n${fence}\n\n`
    },
  })

  return `${turndown.turndown(html)
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}

export function sha256(value: Uint8Array | string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function serializeOfficialRegistry(registry: OfficialDocumentRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`
}
