import { z } from 'zod'
import { ValidationError } from './errors'

/**
 * Bailian Studio API 的运行时输入校验 schema 集合（基于 zod）。
 *
 * 为外部输入（HTTP body / query）提供类型安全的校验：校验通过的值自带静态类型，
 * 调用方无需手动断言。所有面向外部的端点都应通过这里的 schema 或
 * `validateInput` / `safeValidate` 处理输入，避免未校验数据直接进入业务层。
 */

// 创建 Generation 的请求 schema。userId 刻意不在 schema 中——API 从已认证
// session（cookie）派生 userId，永不接受请求体里的 userId，从源头关闭 IDOR。
export const CreateGenerationSchema = z.object({
  modelId: z.string().min(1, 'Model ID is required'),
  params: z.record(z.string(), z.unknown()),
  assetRefs: z.record(
    z.string().min(1, 'Asset parameter name is required'),
    z.union([
      z.string().min(1, 'Asset ID is required'),
      z.array(z.string().min(1, 'Asset ID is required')).min(1, 'At least one asset ID is required'),
    ]),
  ).refine(refs => Object.keys(refs).length > 0, 'At least one asset binding is required').optional(),
  idempotencyKey: z.string().optional(),
})

export type CreateGenerationInput = z.infer<typeof CreateGenerationSchema>

// 需要 userId 的 GET 端点查询 schema。
export const UserIdQuerySchema = z.object({
  userId: z.string().min(1, 'userId query parameter is required'),
})

export type UserIdQuery = z.infer<typeof UserIdQuerySchema>

// 列出 Generation 的查询 schema。同样地，userId 来自 session 而非 query。
export const GenerationListViewSchema = z.enum([
  'completed',
  'active',
  'hidden',
  'deleted',
])

const GenerationListViewsSchema = z.preprocess(
  value => typeof value === 'string'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : value,
  z.array(GenerationListViewSchema)
    .max(4)
    .transform(views => [...new Set(views)])
    .optional(),
)

export const ListGenerationsSchema = z.object({
  status: z.enum([
    'draft',
    'submitting',
    'processing',
    'provider_processing',
    'saving_output',
    'succeeded',
    'failed',
    'cancelled',
  ]).optional(),
  views: GenerationListViewsSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
})

export type ListGenerationsInput = z.infer<typeof ListGenerationsSchema>
export type GenerationListView = z.infer<typeof GenerationListViewSchema>

// 获取单个 Generation 的路径参数 schema。
export const GetGenerationSchema = z.object({
  id: z.string().min(1, 'Generation ID is required'),
})

export type GetGenerationInput = z.infer<typeof GetGenerationSchema>

export const SetGenerationLibraryStateSchema = z.object({
  state: z.enum(['visible', 'hidden', 'deleted']),
})

export type SetGenerationLibraryStateInput = z.infer<typeof SetGenerationLibraryStateSchema>

// 模型参数描述 schema（对应 manifest 中每个参数的形状）。
export const ModelParameterSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'boolean', 'media']),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.unknown(),
  })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().optional(),
  minItems: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  mediaKind: z.enum(['image', 'video', 'audio', 'text']).optional(),
})

export type ModelParameter = z.infer<typeof ModelParameterSchema>

// provider 执行结果 schema（成功/失败标志、输出、错误、成本、元数据）。
export const ProviderResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }).optional(),
  costCents: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type ProviderResult = z.infer<typeof ProviderResultSchema>

// 通用 API 响应外壳 schema。
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
})

export type ApiResponse = z.infer<typeof ApiResponseSchema>

/**
 * 按 schema 校验输入；失败时抛出 ValidationError。
 *
 * 取首个 zod issue 的 message 作为错误消息，path 拼接为 field（fallback 到 context），
 * 并把完整 zod issue 塞进 metadata 便于排障。这样 API 层捕获 ValidationError 后，
 * 既能给前端一个简洁的字段错误，也能在日志里保留完整诊断信息。
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context: string = 'input'
): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const firstError = result.error.issues[0]
    if (!firstError) {
      throw new ValidationError('Validation failed with no details', context)
    }

    const field = firstError.path.join('.') || context
    throw new ValidationError(
      firstError.message,
      field,
      { field, zodError: firstError }
    )
  }
  return result.data
}

/**
 * 不抛异常的校验：返回 tagged union（success 分支带数据，failure 分支带 zodError）。
 * 适用于调用方希望自行处理错误、或校验仅作「尽力而为」提示的场景。
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
