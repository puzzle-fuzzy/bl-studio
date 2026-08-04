import type { ApiClientError } from '@bailian-studio/api-client'

/**
 * 服务端字段级校验错误的解析与本地化。
 *
 * API 的 `INVALID_GENERATION_PARAMS` 错误把校验问题放在
 * `details.issues[]`，每条含 `{ field, code, messages: { 'zh-CN', 'en-US' } }`。
 * 前端读取中文文案并按 field 归组，用于表单字段级错误展示；绝不展示 provider
 * 原文。
 */

export interface FieldIssue {
  field: string
  code: string
  message: string
}

interface RawIssue {
  field?: unknown
  code?: unknown
  messages?: Record<string, unknown>
  message?: unknown
}

/** 从任意抛出的错误里提取按字段归组的校验问题。找不到时返回空 Map。 */
export function readParameterValidationErrors(error: unknown): Map<string, FieldIssue> {
  const details = (error as Partial<ApiClientError> | undefined)?.details
  const issues = details !== null && typeof details === 'object'
    ? (details as Record<string, unknown>).issues
    : undefined
  if (!Array.isArray(issues)) return new Map()

  const map = new Map<string, FieldIssue>()
  for (const raw of issues) {
    const issue = raw as RawIssue
    if (typeof issue.field !== 'string' || issue.field === '') continue
    const code = typeof issue.code === 'string' ? issue.code : ''
    const message =
      (typeof issue.messages?.['zh-CN'] === 'string' ? issue.messages['zh-CN'] : undefined) ??
      (typeof issue.messages?.en === 'string' ? issue.messages.en : undefined) ??
      (typeof issue.message === 'string' ? issue.message : '') ??
      '参数不合法'
    map.set(issue.field, { field: issue.field, code, message })
  }
  return map
}
