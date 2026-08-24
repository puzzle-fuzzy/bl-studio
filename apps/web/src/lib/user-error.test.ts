import { describe, expect, it } from 'vitest'
import { ApiClientError } from '@bailian-studio/api-client'
import { userErrorMessage } from './user-error'

describe('userErrorMessage', () => {
  it('maps known error codes to safe Chinese copy', () => {
    const error = new ApiClientError('AUTH_INVALID_CREDENTIALS', 'msg', 401, undefined, 'trace-1')
    expect(userErrorMessage(error)).toBe('邮箱或密码不正确')
  })

  it('falls back to HTTP status mapping', () => {
    const error = new ApiClientError('SOME_UNKNOWN_CODE', 'msg', 429, undefined, 'trace-1')
    expect(userErrorMessage(error)).toBe('操作过于频繁，请稍后再试')
  })

  it('maps storage upload failures to actionable copy', () => {
    const error = new ApiClientError('STORAGE_UPLOAD_TIMEOUT', 'internal', 504, undefined, 'trace-1')
    expect(userErrorMessage(error)).toBe('图片上传耗时较长，请检查文件大小后重试')
  })

  it('never leaks provider raw messages', () => {
    const error = new ApiClientError('UNKNOWN_CODE', 'msg', 500, { internal: 'secret provider detail' }, 'trace-1')
    expect(userErrorMessage(error)).toBe('服务暂时不可用，请稍后再试')
  })

  it('maps AbortError to cancelled copy', () => {
    expect(userErrorMessage(new DOMException('aborted', 'AbortError'))).toBe('操作已取消')
  })

  it('returns generic copy for unknown errors', () => {
    expect(userErrorMessage(new Error('boom'))).toBe('操作失败，请稍后重试')
  })
})
