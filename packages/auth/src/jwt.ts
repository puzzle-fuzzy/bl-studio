import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 自托管 session token 用的极简 HS256 JWT 签发/校验工具。
 *
 * 这里的 JWT token 就是存放在 http-only cookie 中的凭证。payload 里的 `sid`
 * （session id）同时也是 sessions 表中的一行——这意味着服务端可以在 token 的
 * `exp` 到期之前，直接删除该行就立即撤销 session（用户登出、安全事件强制下线
 * 等场景）。换言之：token 本身是无状态的，但"是否仍然有效"还要回查 sessions
 * 行，详见 service.ts 的 verifyToken（token 签名/过期通过 ≠ session 仍有效）。
 *
 * 设计取舍：刻意不引入外部 JWT 库——claims 固定、算法固定为 HS256（对称签名，
 * 单服务自签自验，无需非对称密钥分发），手写实现更小、更易审计。
 */

export interface JwtPayload {
  /** subject——即用户 id（users.id）。 */
  sub: string
  /** session id，对应 sessions 表的 id 主键。 */
  sid: string
  /** 签发时间（issued-at），unix 秒。 */
  iat: number
  /** 过期时间（expiry），unix 秒。 */
  exp: number
  /** 密钥版本号，便于在不作废全部 token 的情况下平滑轮换签名密钥。 */
  ver?: number
}

export interface SignJwtOptions {
  secret: string
  userId: string
  sessionId: string
  /** 有效期，自签发时间起算的秒数。 */
  ttlSeconds: number
  /** 签发时刻，unix 毫秒；默认 Date.now()（可注入以便测试）。 */
  nowMs?: number
  /** 密钥版本号，用于轮换支持；默认 1。 */
  keyVersion?: number
}

/** 固定头 `{"alg":"HS256","typ":"JWT"}`，base64url 编码后作为 token 第一段。 */
const HEADER = b64urlString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

function b64urlString(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function b64urlDecode(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8')
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/**
 * 常量时间字符串比较，防止通过响应耗时差异推断签名字符（时序攻击）。
 * 长度不一致直接返回 false，但仍走 timingSafeEqual 以保持恒定控制流。
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

/**
 * 按 HS256 规则签发 JWT token：`<header>.<payload>.<signature>`。
 * payload 携带 sub(userId)、sid(sessionId)、iat、exp、ver。返回值会写入 http-only cookie。
 */
export function signJwt(options: SignJwtOptions): string {
  const nowMs = options.nowMs ?? Date.now()
  const iat = Math.floor(nowMs / 1000)
  const payload: JwtPayload = {
    sub: options.userId,
    sid: options.sessionId,
    iat,
    exp: iat + options.ttlSeconds,
    ver: options.keyVersion ?? 1,
  }
  const payloadSegment = b64urlString(JSON.stringify(payload))
  const signature = sign(`${HEADER}.${payloadSegment}`, options.secret)
  return `${HEADER}.${payloadSegment}.${signature}`
}

export interface VerifyJwtOptions {
  secret: string
  /** 当前时刻，unix 毫秒；默认 Date.now()（可注入以便测试）。 */
  nowMs?: number
  /** 期望的密钥版本号；设置后，版本不符的 token 一律视为无效（用于密钥轮换切换）。 */
  expectedKeyVersion?: number
}

/**
 * 校验并解析 HS256 JWT token。
 *
 * 校验顺序（任一失败均返回 undefined，调用方无法区分具体原因，避免信息泄露）：
 *  1. 必须是 `header.payload.signature` 三段结构；
 *  2. 用 secret 重算签名并与 token 中签名做常量时间比较（防篡改、防时序攻击）；
 *  3. payload 可解析为合法 JSON；
 *  4. exp 未过期；sub/sid 字段类型正确。
 *
 * 注意：本函数只校验 token【本身】是否合法，并不保证对应 session 仍然有效——
 * session 是否仍存活（未撤销、未过期）由 service.ts 的 verifyToken 回查 sessions
 * 表决定，这正是"可撤销 JWT session"的关键：token 有效 ≠ session 有效。
 *
 * @returns 合法则返回解析后的 JwtPayload，否则 undefined
 */
export function verifyJwt(token: string, options: VerifyJwtOptions): JwtPayload | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  const [header, payloadSegment, signature] = parts as [string, string, string]
  if (!safeCompare(signature, sign(`${header}.${payloadSegment}`, options.secret))) return undefined

  let payload: JwtPayload
  try {
    payload = JSON.parse(b64urlDecode(payloadSegment)) as JwtPayload
  } catch {
    return undefined
  }

  const nowMs = options.nowMs ?? Date.now()
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return undefined
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return undefined

  // 若指定了期望密钥版本，版本不符则拒绝（密钥轮换期间可借此逐步淘汰旧版本 token）。
  if (options.expectedKeyVersion !== undefined && payload.ver !== options.expectedKeyVersion) {
    return undefined
  }

  return payload
}

/** 旧接口兼容包装：早期签名 verifyJwt(token, secret, nowMs)，内部转发到新签名。 */
export function verifyJwtLegacy(token: string, secret: string, nowMs: number = Date.now()): JwtPayload | undefined {
  return verifyJwt(token, { secret, nowMs })
}
