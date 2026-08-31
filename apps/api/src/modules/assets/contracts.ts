import { z } from 'zod'

/** 用户资产列表和 admin 用户资产查询共用的 HTTP 查询契约。 */
export const ListAssetsQuerySchema = z.object({
  ids: z.preprocess(
    value => typeof value === 'string' ? value.split(',') : value,
    z.array(z.string().trim().min(1).max(160)).max(100).optional().transform(ids => (
      ids === undefined ? undefined : [...new Set(ids)]
    )),
  ),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']).optional(),
  source: z.enum(['upload', 'link', 'generation', 'derived']).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['time', 'title', 'size']).default('time'),
}).strict()
