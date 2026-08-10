/**
 * 登录回调 URL 的构造与安全校验。
 *
 * 前端登录流程会在 URL 上挂一个 `?cb=<returnTo>` 参数，登录成功后再把用户
 * 跳回 returnTo。这里提供两个方向的能力：
 *  - `buildLoginUrl`：构造带 `?cb=` 参数的登录入口 URL；
 *  - `resolvePostLoginRedirect` / `isAllowedCallback`：在信任 returnTo 之前做
 *    严格白名单校验，防止开放重定向（Open Redirect）和路径穿越。
 *
 * 之所以放在 api-client 包里，是为了让登录回跳校验成为可复用的类型化契约，
 * 而不是散落在页面代码里。
 */

/** URL 上用于携带回跳目标的查询参数名。 */
export const CALLBACK_PARAM = 'cb'

export interface AuthCallbackConfig {
  webOrigin: string
  allowedCallbackOrigins: string[]
  callbackParam?: string
}

/**
 * 判断原始回跳 URL `raw` 是否安全可信。
 *
 * 接受两种形式：
 *  1. 同源绝对 URL（`new URL(raw).origin` 命中 allowedOrigins 白名单）；
 *  2. 以单个 `/` 开头的站内相对路径（如 `/dashboard`），但【不能】以 `//` 开头
 *     —— `//foo.com` 会被浏览器当成协议相对 URL，从而跳到第三方站点。
 *
 * 其余一律拒绝。其中两条是【安全关键点】：
 *  - 含反斜杠 `\` 直接拒绝：这是路径穿越 / 非法回调 URL 的防御性检查。原因有二：
 *    (a) WHATWG URL 规范在解析时会【把 `\` 当成 `/`】处理，导致 `/\evil.com`
 *        等变形可以绕过"以 `//` 开头"的简单判断；
 *    (b) 正常的同源回跳 URL 永远不会包含 `\`，遇到它几乎可以确定是构造攻击
 *        或脏数据，按 fail-closed 原则直接拒掉最安全。
 *  - 协议相对 `//` 在前面那个分支里就因为 `raw.startsWith('//')` 被排除掉了。
 *
 * 解析失败的 URL（`new URL` 抛错）也按 fail-closed 处理为不允许。
 */
export function isAllowedCallback(raw: string | null | undefined, allowedOrigins: readonly string[]): boolean {
  if (!raw) return false

  // 反斜杠拒绝 —— 见上方函数 doc 中的安全说明。
  if (raw.includes('\\')) return false

  // 站内相对路径允许；但 `//foo` 形式（协议相对 URL）已经被上一行的反斜杠检查
  // 与这里的 `!raw.startsWith('//')` 双重护栏挡掉。
  if (raw.startsWith('/') && !raw.startsWith('//')) return true

  try {
    const url = new URL(raw)
    return allowedOrigins.includes(url.origin)
  }
  catch {
    return false
  }
}

/**
 * 构造登录入口 URL：在 `webOrigin` 下挂 `/login`，并把 returnTo 作为
 * `?cb=` 查询参数附上（参数名可用 config.callbackParam 覆盖）。
 */
export function buildLoginUrl(returnTo: string, config: AuthCallbackConfig): string {
  const callbackParam = config.callbackParam ?? CALLBACK_PARAM
  const url = new URL('/login', config.webOrigin)
  url.searchParams.set(callbackParam, returnTo)
  return url.toString()
}

/**
 * 解析登录后的最终跳转目标。
 *
 * 若用户传入的 rawCallback 通过了 isAllowedCallback 校验，就直接用它；
 * 否则【fail-closed】回退到 fallback —— 这里绝不尝试"修正"非法 URL，避免
 * 给开放重定向攻击留下绕过空间。
 */
export function resolvePostLoginRedirect(rawCallback: string | null | undefined, fallback: string, allowedOrigins: readonly string[]): string {
  if (!isAllowedCallback(rawCallback, allowedOrigins)) return fallback
  return rawCallback ?? fallback
}
