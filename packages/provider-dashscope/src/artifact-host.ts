const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * 判断 DashScope 返回的 OSS 产物域名。
 *
 * 结果域名不是固定 host，不能放进 Worker 的静态白名单；规则属于
 * DashScope provider，由组合根注入通用 artifact-fetch。
 */
export function isDashScopeArtifactHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '')
  const labels = normalized.split('.')
  if (labels.length !== 4 || labels[2] !== 'aliyuncs' || labels[3] !== 'com') return false

  const resultLabel = labels[0]
  const ossLabel = labels[1]
  if (resultLabel === undefined || ossLabel === undefined) return false

  const resultPrefix = resultLabel.startsWith('dashscope-result-')
    ? 'dashscope-result-'
    : resultLabel.startsWith('dashscope-')
      ? 'dashscope-'
      : undefined
  if (resultPrefix === undefined || !DNS_LABEL.test(resultLabel)) return false
  if (!ossLabel.startsWith('oss-') || !DNS_LABEL.test(ossLabel)) return false
  return DNS_LABEL.test(resultLabel.slice(resultPrefix.length))
}
