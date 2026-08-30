import { describe, expect, it } from 'vitest'
import {
  ModelCatalogItemSchema,
  ModelParameterSchema,
  ModelValidationRuleSchema,
} from '../packages/api-client/src/schemas'
import { listModelCatalogItems } from '@bailian-studio/dashscope-manifests'
import type { ModelParameter } from '../packages/model-core/src/types'

/**
 * P2-19：catalog → api-client 投影完整性。
 *
 * provider manifest 包是模型目录数据源，api-client 的 schema 是手维护的投影白名单——manifest 新增
 * 参数元数据而 api-client 未同步时，zod `.object()` 会静默剥掉未知字段，前端丢字段。
 * 本测试把「投影字段集合与 manifest 一致」变成断言：
 *  - 类型层：MANIFEST_PARAMETER_FIELDS 必须覆盖 ModelParameter 的全部字段（否则 tsc 红）
 *  - 运行层：每个已注册模型经 ModelCatalogItemSchema.parse 后不丢任何投影字段
 */

// model-core ModelParameter 的全部字段。用 AssertAllCovered 强制覆盖：
// model-core 新增字段而未更新本列表时，typecheck 即红（改错即红）。
const MANIFEST_PARAMETER_FIELDS = [
  'name',
  'label',
  'type',
  'required',
  'defaultValue',
  'description',
  'options',
  'min',
  'max',
  'exclusiveMin',
  'exclusiveMax',
  'step',
  'maxLength',
  'minItems',
  'maxItems',
  'visibleWhen',
  'conditional',
  'mediaKind',
] as const satisfies readonly (keyof ModelParameter)[]

type AssertAllCovered<T extends true> = T
type _ParameterFieldsCovered = AssertAllCovered<
  Exclude<keyof ModelParameter, (typeof MANIFEST_PARAMETER_FIELDS)[number]> extends never ? true : false
>

describe('catalog → api-client 投影完整性（P2-19）', () => {
  it('ModelParameterSchema 声明的字段与 model-core ModelParameter 完全一致', () => {
    const schemaKeys = new Set(Object.keys(ModelParameterSchema.shape))
    for (const field of MANIFEST_PARAMETER_FIELDS) {
      expect(schemaKeys.has(field), `api-client ModelParameterSchema 缺少 model-core 字段 "${field}"`).toBe(true)
    }
    for (const field of schemaKeys) {
      expect(
        MANIFEST_PARAMETER_FIELDS.includes(field as (typeof MANIFEST_PARAMETER_FIELDS)[number]),
        `api-client ModelParameterSchema 声明了 model-core 不存在的字段 "${field}"`,
      ).toBe(true)
    }
  })

  it('一个携带全部字段的参数对象经 ModelParameterSchema.parse 后不丢任何字段', () => {
    const maximal: Record<string, unknown> = {
      name: 'p',
      label: 'P',
      type: 'media',
      required: true,
      defaultValue: 1,
      description: 'd',
      options: [{ label: 'A', value: 1 }],
      min: 1,
      max: 5,
      exclusiveMin: false,
      exclusiveMax: false,
      step: 1,
      maxLength: 10,
      minItems: 1,
      maxItems: 5,
      visibleWhen: { field: 'other', equals: 'x' },
      conditional: { when: { field: 'other', equals: 'y' }, min: 1, max: 2 },
      mediaKind: 'image',
    }
    const parsed = ModelParameterSchema.parse(maximal) as Record<string, unknown>
    for (const field of MANIFEST_PARAMETER_FIELDS) {
      expect(parsed, `ModelParameterSchema 剥掉了字段 "${field}"`).toHaveProperty(field)
    }
  })

  it('每个已注册模型的 rules 都能通过 api-client 规则投影', () => {
    for (const model of listModelCatalogItems()) {
      for (const rule of model.rules ?? []) {
        expect(() => ModelValidationRuleSchema.parse(rule), `${model.id} 的规则投影不完整`).not.toThrow()
      }
    }
  })

  it('每个已注册模型经 ModelCatalogItemSchema.parse 后不丢投影字段', () => {
    const REQUIRED_PROJECTED_FIELDS = [
      'id',
      'provider',
      'providerModel',
      'displayName',
      'category',
      'operation',
      'taskMode',
      'capabilities',
      'parameters',
      'availability',
    ] as const

    for (const model of listModelCatalogItems()) {
      const parsed = ModelCatalogItemSchema.parse(model)
      for (const field of REQUIRED_PROJECTED_FIELDS) {
        expect(parsed, `${model.id} 投影丢失字段 "${field}"`).toHaveProperty(field)
      }
      // 参数整体透传：任何参数元数据字段被 schema 剥掉都会让 toEqual 失败
      expect(parsed.parameters).toEqual(model.parameters)
      // 可选投影字段：源有则必须原样保留
      if (model.description !== undefined) expect(parsed.description).toBe(model.description)
      if (model.rules !== undefined) expect(parsed.rules).toEqual(model.rules)
      if (model.availability !== undefined) expect(parsed.availability).toEqual(model.availability)
      if (model.referenceFormat !== undefined) expect(parsed.referenceFormat).toBe(model.referenceFormat)
    }
  })
})
