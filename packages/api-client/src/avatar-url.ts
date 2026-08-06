/**
 * 用户头像 URL 契约。
 *
 * 所有用户（含未上传头像者）的头像都走同一个公开端点
 * `GET /api/avatars/:userId`：有自定义头像回传文件，否则回传由 userId
 * 确定性生成的 identicon 默认头像。前端拿到 userId 即可拼出稳定可缓存、
 * 且随头像变化自动刷新的 URL（服务端按请求回传当前头像）。
 *
 * 注意：这是相对路径，apps 消费时用各自的 resolveApiUrl 补全 origin。
 */
export function avatarUrlFor(userId: string): string {
  return `/api/avatars/${encodeURIComponent(userId)}`
}
