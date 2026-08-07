/**
 * 判断一个运行时抛错是否属于「瞬时、可重试」的故障。
 *
 * 供 thumbnail / media 等媒体派生任务判断是否值得重试。storage 适配层（OSS SDK、
 * 本地 IO）与 ffmpeg 都抛裸 Error，没有统一的结构化 `.info` 包装，只能从
 * error.code / message 里识别常见瞬时信号：
 *  - 网络：ECONNRESET / ECONNREFUSED / ENOTFOUND / fetch failed / socket hang up…
 *  - 超时：RequestTimeout / timeout / ETIMEDOUT
 *  - OSS / 服务端节流与抖动：InternalError / ServiceUnavailable / SlowDown /
 *    RequestTimeTooSkewed / HTTP 5xx 状态码
 *
 * 关键词与 provider-dashscope 的 classifyDashScopeError 网络兜底同源，但这里不引入
 * provider 分类，只回答「要不要重试」这一个问题。判定为瞬时错误时，即便猜错也只是
 * 多花一次被 maxAttempts 封顶的重试，不会无限循环；而漏判（把瞬时网络抖动当永久
 * 失败）正是本模块要堵住的：P2-06。
 */
export function isTransientFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const code = (error as { code?: unknown }).code
  const codeText = typeof code === 'string' ? code.toLowerCase() : ''
  const haystack = error.message.toLowerCase()
  const compact = haystack.replace(/[^a-z0-9]/g, '')

  if (codeText.includes('econnreset')
    || codeText.includes('econnrefused')
    || codeText.includes('enotfound')
    || codeText.includes('etimedout')
    || codeText.includes('getaddrinfo')
  ) {
    return true
  }

  return compact.includes('fetchfailed')
    || compact.includes('networkerror')
    || compact.includes('serviceunavailable')
    || compact.includes('internalerror')
    || compact.includes('slowdown')
    || compact.includes('requesttimeskewed')
    || haystack.includes('socket hang up')
    || haystack.includes('network is unreachable')
    || haystack.includes('timeout')
    || /\b5\d\d\b/.test(error.message)
}
