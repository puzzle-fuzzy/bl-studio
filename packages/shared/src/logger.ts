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
 *
 * R2-P0-04：补齐 accessKeyId/accessKey/jwt/cookie/credential/signature/session。
 */
const SENSITIVE_METADATA_KEY = /(?:prompt|input(?:Params)?|\binput\b|params|raw|body|response|authorization|api[-_]?key|access[-_]?key|password|secret|token|credential|signature|jwt|session|cookie|signed[-_]?url|source[-_]?url|read[-_]?url)/i

/**
 * 值级凭据形态。key 名不在脱敏名单里也可能在值中出现凭据（R2-P0-03：错误文本里的
 * DB 连接串 / provider 网络错误 / 被包装的 prompt 或签名 URL 片段），因此对每个
 * 字符串值做一次模式扫描，命中即整段替换为 `[Redacted]`。
 *
 * 覆盖：JWT、sk-/AK-/secret- 前缀密钥、云厂商 access key（LTAI/AKIA/ASIA/AKID）、
 * Bearer token、≥20 位连续大写/数字/下划线/中划线的 token 形态（首字符必须是字母，
 * 避免误伤纯数字时间戳）。
 */
const CREDENTIAL_VALUE_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, // JWT（以 eyJ 开头的三段式）
  /\b(?:sk|ak|secret|apikey|api[-_]?key)[-_:][A-Za-z0-9]{6,}\b/gi, // sk-xxx / AK_xxx / secret:xxx
  /\b(?:LTAI|AKIA|ASIA|AKID)[A-Za-z0-9]{6,}\b/g, // 云厂商 access key 前缀
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, // Bearer token（真实 token 远比 8 位长）
  /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/g, // scheme://user:pass@host（DB/URL 内嵌凭据）
  /\b(?:password|passwd|pwd|secret|token|apikey|api[-_]?key)=[^\s&]+/gi, // key=value 凭据
  /\b[A-Z][A-Z0-9_\-]{19,}\b/g, // 长连续大写/数字 token（≥20，首字符为字母）
] as const

/** 把字符串值里出现的凭据形态替换为 [Redacted]，剩余上下文保留以便排查。 */
export function redactCredentialSubstrings(value: string): string {
  let result = value
  for (const pattern of CREDENTIAL_VALUE_PATTERNS) {
    result = result.replace(pattern, '[Redacted]')
  }
  return result
}

/**
 * 把任意值安全地序列化为 JSON 字符串。
 *
 * 关键处理：
 *  - bigint 转为字符串（JSON 原生不支持 bigint，直接序列化会抛错）；
 *  - 只在当前对象祖先链上记录引用，遇到循环引用时输出 '[Circular]' 占位，避免把
 *    两个字段共享的普通对象误判为循环引用；
 *  - 命中 SENSITIVE_METADATA_KEY 的 key 输出 '[Redacted]'（键名级）；
 *  - 任何字符串值再做值级凭据模式扫描（R2-P0-04：message/error 等非名单 key 的
 *    错误文本里的凭据也会被模糊化）；
 *  - 整体 try/catch 兜底：若 metadata 中含 JSON 无法序列化的值（如函数），返回固定占位字符串。
 *
 * 上述多重防护共同保证「日志调用本身永远不会抛出」——日志绝不能成为新的故障源。
 */
export function safeJsonStringify(value: unknown): string {
  // 只追踪当前递归祖先链，而不是所有已经访问过的对象。后者会把同一个普通
  // 对象被两个字段复用的情况误判成循环引用，造成日志数据丢失。
  const ancestors: object[] = []

  try {
    return JSON.stringify(value, function replacer(key, raw) {
      if (key.length > 0 && SENSITIVE_METADATA_KEY.test(key)) return '[Redacted]'

      if (typeof raw === 'string') return redactCredentialSubstrings(raw)

      if (typeof raw === 'bigint') return raw.toString()

      if (typeof raw === 'object' && raw !== null) {
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
          ancestors.pop()
        }
        if (ancestors.includes(raw)) return '[Circular]'
        ancestors.push(raw)
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
    // R2-P0-04：message 参数也会被值级扫描（错误文本放 message 第一参时同样脱敏）。
    const safeMessage = redactCredentialSubstrings(message)
    if (resolveLogFormat() === 'json') {
      writeJsonLine(level, scope, safeMessage, meta)
      return
    }

    const payload = meta ? ` ${safeJsonStringify(meta)}` : ''
    console[level](`[${scope}] ${safeMessage}${payload}`)
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
