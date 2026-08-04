/**
 * 进程内极简日志器。
 *
 * 设计取向：零依赖；结构化字段以 JSON 序列化追加到消息尾部，形如
 * `[scope] message {metaJson}`，既便于人读也便于日志采集器按前缀与 JSON 后缀
 * 解析。仅用于本地/开发期；若生产环境需接入外部日志后端，替换本模块的 write
 * 实现即可，调用方无需改动。
 */

/**
 * 日志器接口。三个级别 info / warn / error，每条日志接受一条消息和可选的
 * 结构化 metadata（会被 JSON 序列化）。接口刻意保持极简，便于在任何层注入
 * （含测试用 mock logger）。
 */
export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * 把 metadata 安全地序列化为 JSON 字符串。
 *
 * 关键处理：
 *  - bigint 转为字符串（JSON 原生不支持 bigint，直接序列化会抛错）；
 *  - 用 WeakSet 记录已访问对象，遇到循环引用时输出 '[Circular]' 占位，避免抛 TypeError；
 *  - 整体 try/catch 兜底：若 metadata 中含 JSON 无法序列化的值（如函数），返回固定占位字符串。
 *
 * 上述三重防护共同保证「日志调用本身永远不会抛出」——日志绝不能成为新的故障源。
 */
const SENSITIVE_METADATA_KEY = /(?:prompt|input(?:Params)?|\binput\b|params|raw|body|response|authorization|api[-_]?key|password|secret|token|signed[-_]?url|source[-_]?url|read[-_]?url)/i

function stringifyMetadata(meta: Record<string, unknown>): string {
  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(meta, (key, value: unknown) => {
      if (key.length > 0 && SENSITIVE_METADATA_KEY.test(key)) return '[Redacted]'

      if (typeof value === 'bigint') return value.toString()

      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }

      return value
    })
  }
  catch {
    return '"[Unserializable metadata]"'
  }
}

/**
 * 创建一个带 scope 前缀的日志器。每条日志形如 `[scope] message {metaJson}`。
 * scope 用于在混杂的多服务日志中快速定位来源（如 'storage' / 'worker'）。
 */
export function createLogger(scope: string): Logger {
  const write = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    const payload = meta ? ` ${stringifyMetadata(meta)}` : ''
    console[level](`[${scope}] ${message}${payload}`)
  }

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}
