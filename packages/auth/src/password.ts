/**
 * 密码哈希：基于 @node-rs/argon2 的 argon2id 实现。
 *
 * 安全约定：明文密码永不存储、永不记日志——只有 argon2id 哈希值会落到 users
 * 表的 password_hash 列。argon2id 是 OWASP 推荐的密码哈希算法（抗 GPU/ASIC
 * 暴力破解、抗时序攻击）。哈希串内嵌算法标识、salt 与调优参数，校验时按串
 * 内参数执行，因此算法参数后续演进不会使旧哈希失效。
 *
 * 注：原实现基于 Bun 运行时内置的 Bun.password；重写为 Node 运行时后改用
 * @node-rs/argon2（原生绑定，argon2id 默认参数），哈希格式不变（仍是标准
 * $argon2id$ 前缀），语义保持一致。
 */

import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

// @node-rs/argon2 的 Algorithm.Argon2id === 2。该枚举是 ambient const enum，
// 在 verbatimModuleSyntax 下无法访问成员，故使用带注释的字面值。
const ARGON2ID = 2

/**
 * 把明文密码哈希为可存储的 argon2id 字符串（含算法、salt、参数）。
 * 返回值直接写入 users.password_hash。
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, { algorithm: ARGON2ID })
}

/**
 * 校验明文密码是否与已存储的 argon2id 哈希匹配。
 * 返回 Promise<boolean>；恒定的返回类型便于调用方避免把"用户不存在"与"密码错误"
 * 区分开（两者在 login 流程中都应映射到 AUTH_INVALID_CREDENTIALS，防止账号枚举）。
 */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2Verify(hash, plain)
}

/**
 * 用户不存在时的"假校验"目标哈希（P1-28）：让 login 对未知邮箱也跑一次完整的
 * argon2 校验，抹平「存在/不存在」的响应时间差（计时侧信道 / 账号枚举）。
 *
 * 固定字符串是某个随机口令的 argon2id 哈希（明文已丢弃，无人知晓），只作时序
 * 等价物，不代表任何真实账号。参数与 hashPassword 默认一致（m=19456,t=2,p=1），
 * 校验耗时与真实账号同量级。
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Hn4wJWUbvME1JTGA86LTtw$gLiHDVY0FGSrPIlsanpfiIxkwuwqmgIXC9qs2ahR50w'
