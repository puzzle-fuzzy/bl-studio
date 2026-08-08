import { ApiClientError } from '@bailian-studio/api-client'

/**
 * 用户可读的错误文案本地化。
 *
 * 原则：绝不把 provider 原文或内部堆栈暴露给用户。按错误码 → 类别 → HTTP
 * status 三级回退，全部映射为安全的中文文案；未知错误统一显示通用提示。
 */

const CODE_MESSAGES: Record<string, string> = {
  // 认证
  AUTH_INVALID_CREDENTIALS: '邮箱或密码不正确',
  AUTH_EMAIL_TAKEN: '该邮箱已被注册',
  AUTH_EMAIL_UNVERIFIED: '请先完成邮箱验证',
  AUTH_TOKEN_INVALID: '验证链接无效，请重新获取',
  AUTH_TOKEN_EXPIRED: '验证链接已过期，请重新获取',
  AUTH_TOKEN_CONSUMED: '该链接已被使用，请直接登录',
  AUTH_PASSWORD_UNCHANGED: '新密码不能与当前密码相同',
  AUTH_EMAIL_RATE_LIMITED: '操作过于频繁，请稍后再试',
  EMAIL_DELIVERY_FAILED: '验证邮件发送失败，请稍后再试',
  AUTH_UNAUTHORIZED: '请先登录',
  AUTH_FORBIDDEN: '没有权限执行此操作',
  AUTH_BANNED: '该账号已被封禁，请联系管理员',
  // 生成
  MODEL_NOT_FOUND: '模型不存在或已下线',
  GENERATION_NOT_FOUND: '生成记录不存在',
  GENERATION_NOT_CANCELLABLE: '该任务已结束，无法取消',
  GENERATION_NOT_RETRYABLE: '该任务当前无法重试',
  GENERATION_DAILY_LIMIT_EXCEEDED: '已达今日生成限额，请明天再试',
  INVALID_GENERATION_PARAMS: '生成参数不合法，请检查输入',
  IDEMPOTENCY_CONFLICT: '检测到重复提交，请刷新后重试',
  INVALID_CURSOR: '列表游标已失效，请刷新',
  EVENT_CURSOR_EXPIRED: '实时连接已过期，正在重新同步',
  // 资产业物
  ARTIFACT_NOT_FOUND: '产物不存在或已被删除',
  ASSET_NOT_FOUND: '素材不存在或已被删除',
  ASSET_DERIVATIVE_NOT_FOUND: '派生素材不存在',
  SHARE_NOT_FOUND: '分享不存在或已失效',
  MEDIA_JOB_NOT_FOUND: '媒体任务不存在',
  // 积分
  POINTS_INSUFFICIENT: '积分不足，无法发起生成',
  POINTS_ACCOUNT_NOT_FOUND: '积分账户不存在',
  POINTS_IDEMPOTENCY_CONFLICT: '积分操作重复提交',
  POINTS_SETTLEMENT_ANOMALY: '结算出现异常，请稍后查看',
  // 传输层
  VALIDATION_ERROR: '输入内容不合法，请检查后重试',
  REQUEST_TOO_LARGE: '文件或请求体过大',
  CSRF_ORIGIN_INVALID: '请求来源校验失败，请刷新页面重试',
  RATE_LIMITED: '操作过于频繁，请稍后再试',
  NETWORK_ERROR: '网络连接异常，请检查网络后重试',
  DATABASE_ERROR: '服务暂时不可用，请稍后再试',
  INTERNAL_ERROR: '服务出现异常，请稍后再试',
}

const STATUS_FALLBACK: Record<number, string> = {
  400: '请求不合法，请检查后重试',
  401: '请先登录',
  403: '没有权限执行此操作',
  404: '资源不存在',
  409: '操作冲突，请刷新后重试',
  413: '文件或请求体过大',
  429: '操作过于频繁，请稍后再试',
  500: '服务暂时不可用，请稍后再试',
}

/**
 * 把一个未知异常解析为安全的用户文案。已知类型的细节会收敛到稳定的中文提示；
 * 未知错误不会泄露内部信息。
 */
export function userErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code !== undefined) {
      const byCode = CODE_MESSAGES[error.code]
      if (byCode !== undefined) return byCode
    }
    if (error.status !== undefined) {
      const byStatus = STATUS_FALLBACK[error.status]
      if (byStatus !== undefined) return byStatus
    }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return '操作已取消'
  }
  return '操作失败，请稍后重试'
}

/** 注册邮件投递失败或命中未验证账号时，允许用户进入真实重发路径。 */
export function canResendVerification(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  if (error.code === 'EMAIL_DELIVERY_FAILED') return true
  if (error.code !== 'AUTH_EMAIL_TAKEN' || typeof error.details !== 'object' || error.details === null) return false
  return 'action' in error.details && (error.details as { action?: unknown }).action === 'resend_verification'
}
