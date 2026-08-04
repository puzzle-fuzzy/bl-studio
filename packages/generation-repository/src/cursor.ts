/**
 * 生成记录列表的 keyset 分页游标（opaque cursor）编解码。
 *
 * 游标内部携带某一页最后一行的排序键 (createdAt, id)，下一页据此用稳定的
 * WHERE 条件续读。对外线路格式为 base64url(JSON)，调用方应把它当成不透明
 * token 对待；解析失败的游标会抛 GenerationRepositoryError('INVALID_CURSOR')，而不是
 * 把内部结构泄露给上层。
 *
 * 之所以采用 keyset（而非 offset）分页：offset 在并发写入下会出现"跳页/
 * 重复"问题——一旦在翻页期间有新记录插入或旧记录状态变化，offset 窗口就会
 * 漂移；而 keyset 用 (createdAt, id) 这一无歧义的有序元组做比较，窗口起点
 * 始终确定，对插入友好且在大表上性能稳定（可直接利用 created_at + id 索引）。
 */
import { GenerationRepositoryError } from './errors'
import type { GenerationRecord } from './types'

export type GenerationListView = 'completed' | 'active' | 'hidden' | 'deleted'

export interface ListGenerationRecordsOptions {
  /** 每页大小；会被 clamp 到 [1, 100]，默认 20。 */
  limit?: number
  /** 不透明游标：来自上一页返回的 `nextCursor`。 */
  cursor?: string
  /** 可选状态过滤（如 'succeeded'、'failed'）。 */
  status?: string
  /**
   * Owner 库视图，多个视图以 OR 语义组合。缺省或为空时，
   * 默认视图包含所有未隐藏、未删除的记录。
   */
  views?: readonly GenerationListView[]
}

export interface ListGenerationRecordsResult {
  items: GenerationRecord[]
  /** 还有更多行时出现；将其作为下一页的 `cursor` 传回即可续读。 */
  nextCursor?: string
}

interface CursorPayload {
  createdAt: string
  id: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * 将每页条数 clamp 到安全区间：未传或非有限值用默认值，否则收敛到 [1, MAX_LIMIT]。
 * 取整是为了防止上层传入小数 / 字符串化数字等异常输入。
 */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

/** 将 (createdAt, id) 编码为对外的 base64url 不透明 token。 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * 将不透明 token 解码回 (createdAt, id)。
 * 任何 base64url / JSON / 字段缺失层面的错误都统一变成 INVALID_CURSOR，
 * 不向调用方泄露具体反序列化细节。
 */
export function decodeCursor(token: string): CursorPayload {
  let json: string
  try {
    json = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw invalidCursor('cursor is not valid base64url')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw invalidCursor('cursor is not valid JSON')
  }

  return readCursorPayload(parsed)
}

function readCursorPayload(parsed: unknown): CursorPayload {
  if (
    typeof parsed === 'object'
    && parsed !== null
    && 'createdAt' in parsed
    && 'id' in parsed
    && typeof parsed.createdAt === 'string'
    && typeof parsed.id === 'string'
  ) {
    return { createdAt: parsed.createdAt, id: parsed.id }
  }
  throw invalidCursor('cursor is missing createdAt/id')
}

function invalidCursor(reason: string): GenerationRepositoryError {
  return new GenerationRepositoryError('INVALID_CURSOR', `Invalid pagination cursor: ${reason}`)
}
