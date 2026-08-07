import { z } from 'zod'
import { MAX_CREDIT_AMOUNT_CENTS } from '@bailian-studio/credit-ledger'

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
  /** offset 分页：传 page 后返回 total，供管理后台翻页。 */
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export const TargetUserSchema = z.object({ userId: z.string().trim().min(1).max(256) }).strict()

/** 批量用户操作（封禁/解封/删除）：1~100 个用户 ID。 */
export const BatchUsersSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
}).strict()

export type BatchUsersInput = z.infer<typeof BatchUsersSchema>

/**
 * 批量赠送积分：每个目标用户各加 amountCents。idempotencyKey 为整批共享的
 * 幂等键（前端用 crypto.randomUUID() 生成），按 `key:userId` 派生到每个用户，
 * 网络重试不重复加。
 */
export const BatchGrantPointsSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
  amountCents: z.number().int().positive().max(MAX_CREDIT_AMOUNT_CENTS),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()

export type BatchGrantPointsInput = z.infer<typeof BatchGrantPointsSchema>

/** admin 画廊治理列表：含隐藏作品（includeHidden=true）、按作者/提示词搜索、keyset 分页。 */
export const ListAdminGalleryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  /** 查询参数为字符串 'true'/'false'（Elysia query），在路由层转布尔。 */
  includeHidden: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  authorId: z.string().trim().min(1).max(256).optional(),
}).strict()

export type ListAdminGalleryQueryInput = z.infer<typeof ListAdminGalleryQuerySchema>

/** admin 下架/恢复一条公开作品的目标。 */
export const TargetGalleryRecordSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()

export type TargetGalleryRecordInput = z.infer<typeof TargetGalleryRecordSchema>

/** admin 批量下架/恢复/软删：1~100 个作品 id。 */
export const BatchGallerySchema = z.object({
  ids: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
}).strict()

export type BatchGalleryInput = z.infer<typeof BatchGallerySchema>

/** admin 任务中心列表：keyset 分页 + 可选 status/type/domain/userId/recordId 过滤。 */
export const ListAdminTasksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  type: z.string().trim().min(1).max(120).optional(),
  domain: z.string().trim().min(1).max(120).optional(),
  userId: z.string().trim().min(1).max(256).optional(),
  recordId: z.string().trim().min(1).max(256).optional(),
}).strict()

export type ListAdminTasksQueryInput = z.infer<typeof ListAdminTasksQuerySchema>

/** admin 画廊产物读取的目标（recordId + artifactId）。 */
export const AdminGalleryArtifactParamsSchema = z.object({
  id: z.string().trim().min(1).max(256),
  artifactId: z.string().trim().min(1).max(256),
}).strict()

export type AdminGalleryArtifactParamsInput = z.infer<typeof AdminGalleryArtifactParamsSchema>

/** 批量维护每模型成本单价。 */
export const UpsertModelCostsSchema = z.object({
  entries: z.array(z.object({
    modelId: z.string().trim().min(1).max(256),
    unitCostCents: z.number().int().min(0),
  })).min(1).max(200),
}).strict()

export type UpsertModelCostsInput = z.infer<typeof UpsertModelCostsSchema>

/** 分析窗口：from/to 或 days（默认近 30 天）。 */
export const AnalyticsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
}).strict()

export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>
