import { z } from 'zod'

/** 创建账户（无邮箱验证）：管理员直接指定密码与角色。 */
export const CreateUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
}).strict()

/** 更新用户：仅支持昵称与角色（邮箱变更涉及唯一索引与登录身份，v1 不支持）。 */
export const UpdateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
}).strict()

export const ListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  q: z.string().trim().min(1).max(120).optional(),
}).strict()

export const TargetUserSchema = z.object({ userId: z.string().trim().min(1).max(256) }).strict()
