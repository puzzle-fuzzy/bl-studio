import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根的标志文件——出现该文件即认为是 monorepo 根目录。 */
const REPO_ROOT_SENTINEL = 'turbo.json'
/** 未配置 ARTIFACT_LOCAL_ROOT 时的默认根目录（相对仓库根）。 */
const DEFAULT_LOCAL_ROOT = 'var/artifacts'

/**
 * 判断路径是否存在的函数类型。作为参数注入，是为了让 findRepoRoot 在单测中
 * 可以用伪造的文件系统驱动，而不必真正读写磁盘。
 */
export type ExistsChecker = (path: string) => boolean

/** 仓库根缓存。仅缓存"使用真实 existsSync"那次查找的结果，注入路径不缓存。 */
let cachedRepoRoot: string | undefined

/**
 * 从 startDir 逐级向上查找最近的、包含 turbo.json 的祖先目录并返回。
 *
 * 若一直上溯到文件系统根仍未找到标志文件，则回退为 startDir —— 存储模块
 * 绝不应当因为一个"默认路径"的问题而阻断服务启动。仅当使用默认 existsSync
 * （真实文件系统）时缓存结果；注入的 exists 永不缓存，以保证测试的确定性与可重复。
 *
 * @param startDir 起始查找目录（通常是本模块所在目录）
 * @param exists   路径存在性检查函数，默认为 node:fs 的 existsSync
 */
export function findRepoRoot(startDir: string, exists: ExistsChecker = existsSync): string {
  const useCache = exists === existsSync
  if (useCache && cachedRepoRoot !== undefined) return cachedRepoRoot

  let dir = startDir
  for (let i = 0; i < 32; i++) {
    if (exists(join(dir, REPO_ROOT_SENTINEL))) {
      if (useCache) cachedRepoRoot = dir
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break  // 已上溯到文件系统根
    dir = parent
  }

  // 未找到仓库根标志，回退到起始目录而非抛错。
  if (useCache) cachedRepoRoot = startDir
  return startDir
}

/**
 * 根据环境变量解析本地 artifact 根目录，结果与进程 cwd 无关。
 *
 * 解析规则：
 *  - 未设置或空白 → `<仓库根>/var/artifacts`
 *  - 当前平台上的绝对路径 → 原样使用（如 Windows 上的 `G:\...`）
 *  - 相对路径 → 相对【仓库根】解析，而【不是】process.cwd()
 *
 * 之所以锚定仓库根（由本模块位置上溯发现），是为了让 worker（写入侧）和
 * API（读取侧）在 turbo dev 下无论各自 cwd 如何，都解析到同一个物理目录——
 * 这正是历史上"详情页图片 404"的根因（相对路径 + 两侧 cwd 不同导致写读错位）。
 * 生产环境仍建议显式配置绝对路径的 ARTIFACT_LOCAL_ROOT。
 */
export function resolveArtifactLocalRoot(env: Record<string, string | undefined>): string {
  const raw = env['ARTIFACT_LOCAL_ROOT']?.trim()
  const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
  if (raw === undefined || raw === '') return resolve(repoRoot, DEFAULT_LOCAL_ROOT)
  if (isAbsolute(raw)) return raw
  return resolve(repoRoot, raw)
}

/**
 * 判断 value 是否"看起来像另一个平台的绝对路径"：在对方平台规则下是绝对路径、
 * 但在当前平台下不是。典型例子是 macOS/Linux 上见到的 `G:\bailian-studio\...`
 * （win32 绝对路径）。这类值几乎可以确定是从别的操作系统复制过来的，在当前
 * 平台会被当成相对路径片段处理。本函数仅用于触发一个非致命的告警提示。
 *
 * @param platform  指定平台，默认取 process.platform（便于在任意平台上测试 win32 行为）
 */
export function looksLikeForeignAbsolute(
  value: string | undefined,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (value === undefined) return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  if (platform === 'win32') return !win32.isAbsolute(trimmed) && posix.isAbsolute(trimmed)
  return !posix.isAbsolute(trimmed) && win32.isAbsolute(trimmed)
}
