export interface CanvasParameterValueOption {
  value: unknown
}

export interface CanvasParameterValueDefinition {
  name: string
  type: string
  options?: ReadonlyArray<CanvasParameterValueOption>
}

/**
 * 从 Canvas 节点的 parameterValues 投影当前模型可以接受的非媒体参数。
 *
 * Canvas 快照可能比当前模型目录旧，因此只保留当前 manifest 已声明的字段，
 * 并丢弃已经不存在的 select 枚举值；模型校验仍负责范围、必填和跨字段规则。
 * prompt、媒体参数和 aspectRatio 都有各自的 Canvas 绑定，不从这里透传。
 */
export function projectCanvasParameterValues(
  parameters: ReadonlyArray<CanvasParameterValueDefinition>,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const parameter of parameters) {
    if (parameter.name === 'prompt' || parameter.type === 'media' || values[parameter.name] === undefined) continue
    const value = values[parameter.name]
    if (parameter.type === 'select' && parameter.options !== undefined) {
      const isKnownOption = parameter.options.some(option => valuesEqual(option.value, value))
      if (!isKnownOption) continue
    }
    result[parameter.name] = value
  }
  return result
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}
