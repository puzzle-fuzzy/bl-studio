/**
 * 审计动作枚举——audit_logs 表 CHECK 约束的唯一事实源（P1-J）。
 *
 * 此前这个数组定义在 generation-repository/audit-types.ts，但 schema.ts 的
 * CHECK 约束、迁移内嵌 CHECK、ensure-audit-action-constraint.ts 脚本也各自
 * 引用/维护了一份。移到 db 包是因为它拥有 audit_logs 表定义，是所有消费方
 * （generation-repository、API 路由、verify 脚本）的公共依赖。
 *
 * 新增动作时：在此追加 → 更新 schema.ts 的 CHECK → 生成迁移 →
 * scripts/verify/audit-action-consistency.test.ts 自动对账。
 */
export const AUDIT_ACTIONS = [
  'auth.register',
  'auth.verify-email',
  'auth.resend-verification',
  'auth.login',
  'auth.github',
  'auth.forgot-password',
  'auth.reset-password',
  'auth.change-password',
  'auth.logout',
  'auth.logout-all',
  'auth.profile.update',
  'auth.avatar.update',
  'auth.avatar.remove',
  'generation.create',
  'generation.cancel',
  'generation.retry',
  'generation.hide',
  'generation.delete',
  'generation.restore',
  'artifact.read',
  'asset.upload',
  'asset.import',
  'asset.delete',
  'share.create',
  'share.revoke',
  'points.grant',
  'points.adjustment',
  'admin.user.create',
  'admin.user.update',
  'admin.user.delete',
  'admin.user.ban',
  'admin.user.unban',
  'admin.audit.outbox.requeue',
  'gallery.like',
  'gallery.favorite',
  'gallery.visibility-change',
  'admin.gallery.hide',
  'admin.gallery.unhide',
  'feedback.submit',
  'feedback.update',
  'prompt-library.create',
  'prompt-library.delete',
  'content.report.submit',
  'admin.content-report.update',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]
