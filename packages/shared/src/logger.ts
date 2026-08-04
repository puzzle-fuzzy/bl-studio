/**
 * 进程内极简日志器。
 *
 * 两种输出格式：
 * - `console`（默认，本地/开发）：`[scope] message {metaJson}`，结构化字段以
 *   JSON 序列化追加到消息尾部，既便于人读也便于日志采集器按前缀与 JSON 后缀解析；
 * - `json`（生产日志聚合）：每行一个 JSON 对象 `{ts,level,scope,msg,...meta}`
 *   写入 stdout（全部级别单流），供 Loki/Alloy 等采集器按字段解析与过滤。
 *
 * 格式由 `LOG_FORMAT` 显式指定（json/console）；未指定时 `NODE_ENV=production`
 * 自动切为 json，其余环境保持 console。选择入口集中在 createLogger，调用方零改动；
 * 若生产需接入其它日志后端，替换 write 实现即可。
 */

/** 日志输出格式：console 人类可读 vs json 每行一个 JSON 对象。 */
export type LogFormat = 'console' | 'json'

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
 * 敏感 metadata key 名单。命中即脱敏为 `[Redacted]`，防止 prompt/body/secret
 * 等出现在日志中；与格式无关，console 与 json 模式同样生效。
 */
const SENSITIVE_METADATA_KEY = /(?:prompt|input(?:Params)?|\binput\b|params|raw|body|response|authorization|api[-_]?key|password|secret|token|signed[-_]?url|source[-_]?url|read[-_]?url)/i

/**
 * 把任意值安全地序列化为 JSON 字符串。
 *
 * 关键处理：
 *  - bigint 转为字符串（JSON 原生不支持 bigint，直接序列化会抛错）；
 *  - 用 WeakSet 记录已访问对象，遇到循环引用时输出 '[Circular]' 占位，避免抛 TypeError；
 *  - 命中 SENSITIVE_METADATA_KEY 的 key 输出 '[Redacted]'；
 *  - 整体 try/catch 兜底：若 metadata 中含 JSON 无法序列化的值（如函数），返回固定占位字符串。
 *
 * 上述三重防护共同保证「日志调用本身永远不会抛出」——日志绝不能成为新的故障源。
 */
export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(value, (key, raw) => {
      if (key.length > 0 && SENSITIVE_METADATA_KEY.test(key)) return '[Redacted]'

      if (typeof raw === 'bigint') return raw.toString()

      if (typeof raw === 'object' && raw !== null) {
        if (seen.has(raw)) return '[Circular]'
        seen.add(raw)
      }

      return raw
    })
  }
  catch {
    return '"[Unserializable metadata]"'
  }
}

/** 解析日志格式：显式 LOG_FORMAT 优先，其次 production 自动切 json。 */
export function resolveLogFormat(
  source: Readonly<Record<string, string | undefined>> = process.env,
): LogFormat {
  const explicit = source['LOG_FORMAT']?.trim().toLowerCase()
  if (explicit === 'json') return 'json'
  if (explicit === 'console') return 'console'
  if (source['NODE_ENV']?.trim().toLowerCase() === 'production') return 'json'
  return 'console'
}

/**
 * 创建带 scope 前缀的日志器。
 * - console 模式：每条日志形如 `[scope] message {metaJson}`；
 * - json 模式：每条日志一行 `{ts,level,scope,msg,...meta}`，全部级别走 stdout
 *   （单流，避免 warn/error 落入 stderr 造成采集端混流）。
 * scope 用于在混杂的多服务日志中快速定位来源（如 'storage' / 'worker'）。
 */
export function createLogger(scope: string): Logger {
  const write = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    if (resolveLogFormat() === 'json') {
      writeJsonLine(level, scope, message, meta)
      return
    }

    const payload = meta ? ` ${safeJsonStringify(meta)}` : ''
    console[level](`[${scope}] ${message}${payload}`)
  }

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}

/** json 模式：整条记录含保留字段 ts/level/scope/msg 与结构化 meta。 */
function writeJsonLine(
  level: 'info' | 'warn' | 'error',
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const record: Record<string, unknown> = { ...(meta ?? {}) }
  // 保留字段最后写入，即使 meta 里出现 level/scope/msg/ts 也不会覆盖。
  record.ts = new Date().toISOString()
  record.level = level
  record.scope = scope
  record.msg = message
  process.stdout.write(`${safeJsonStringify(record)}\n`)
}
