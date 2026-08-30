/**
 * Canvas 目前向用户暴露的画面比例。
 *
 * 这是画布层的语义值，不是某个 provider 的参数名。模型 manifest 可能把
 * 同一语义声明为 aspectRatio、ratio，或者用 size 的像素尺寸间接表达。
 */
export const CANVAS_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const

export type CanvasAspectRatio = (typeof CANVAS_ASPECT_RATIOS)[number]

export interface CanvasAspectRatioParameterOption {
  label: string
  value: unknown
}

export interface CanvasAspectRatioParameter {
  name: string
  type: string
  options?: ReadonlyArray<CanvasAspectRatioParameterOption>
}

export interface ResolvedCanvasAspectRatioParameter {
  name: string
  value: unknown
}

/**
 * 将模型 manifest 的参数映射为 Canvas 的比例语义。
 *
 * 映射顺序是稳定的：优先选择名为 aspectRatio/ratio 且选项值直接等于目标
 * 比例的参数；若模型只提供 size，则从选项标签或像素尺寸推导比例。这样
 * Canvas 不需要知道任何 provider 字段名，也不会向模型提交未知参数。
 */
export function resolveCanvasAspectRatioParameter(
  parameters: ReadonlyArray<CanvasAspectRatioParameter>,
  aspectRatio: string,
): ResolvedCanvasAspectRatioParameter | undefined {
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio)
  if (normalizedAspectRatio === undefined) return undefined

  for (const preferredName of ['aspectRatio', 'ratio'] as const) {
    const parameter = parameters.find(item => item.name === preferredName && item.type === 'select')
    const option = parameter?.options?.find(item => normalizeAspectRatio(String(item.value)) === normalizedAspectRatio)
    if (parameter !== undefined && option !== undefined) {
      return { name: parameter.name, value: option.value }
    }
  }

  const sizeParameter = parameters.find(item => item.name === 'size' && item.type === 'select')
  const sizeOptions = sizeParameter?.options ?? []
  const sizeRatios = new Set(sizeOptions.flatMap(option => {
    const ratio = optionAspectRatio(option)
    return ratio === undefined ? [] : [ratio]
  }))
  // 只有 size 同时表达多个画面比例时才由 Canvas 比例语义接管它；例如
  // 1K/2K 都是方形的模型，size 仍应作为普通分辨率参数交给节点面板编辑。
  if (sizeRatios.size < 2) return undefined

  const sizeOption = sizeOptions.find(option => {
    const optionRatio = optionAspectRatio(option)
    return optionRatio !== undefined && aspectRatiosEqual(optionRatio, normalizedAspectRatio)
  })
  if (sizeParameter !== undefined && sizeOption !== undefined) {
    return { name: sizeParameter.name, value: sizeOption.value }
  }

  return undefined
}

/** 返回当前模型真正能承载的 Canvas 比例，供前端筛选比例按钮。 */
export function supportedCanvasAspectRatios(
  parameters: ReadonlyArray<CanvasAspectRatioParameter>,
): CanvasAspectRatio[] {
  return CANVAS_ASPECT_RATIOS.filter(aspectRatio => (
    resolveCanvasAspectRatioParameter(parameters, aspectRatio) !== undefined
  ))
}

function optionAspectRatio(option: CanvasAspectRatioParameterOption): string | undefined {
  const labelRatio = extractAspectRatio(option.label)
  if (labelRatio !== undefined) return labelRatio
  return dimensionsToAspectRatio(String(option.value))
}

function normalizeAspectRatio(value: string): string | undefined {
  const normalized = value.trim().replace('：', ':')
  return /^\d+:\d+$/.test(normalized) ? normalized : undefined
}

function extractAspectRatio(value: string): string | undefined {
  const match = value.match(/\b(\d+):(\d+)\b/)
  return match === null ? undefined : `${match[1]}:${match[2]}`
}

function dimensionsToAspectRatio(value: string): string | undefined {
  const match = value.trim().match(/^(\d+)\s*[xX*×]\s*(\d+)$/)
  if (match === null) return undefined

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return undefined

  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

/** Provider 常用近似像素尺寸（例如 928×1664）表达标准比例，允许 2.5% 误差。 */
function aspectRatiosEqual(left: string, right: string): boolean {
  const leftParts = left.split(':').map(Number)
  const rightParts = right.split(':').map(Number)
  const leftWidth = leftParts[0]
  const leftHeight = leftParts[1]
  const rightWidth = rightParts[0]
  const rightHeight = rightParts[1]
  if (
    leftWidth === undefined
    || leftHeight === undefined
    || rightWidth === undefined
    || rightHeight === undefined
    || leftWidth <= 0
    || leftHeight <= 0
    || rightWidth <= 0
    || rightHeight <= 0
  ) return false

  const leftValue = leftWidth / leftHeight
  const rightValue = rightWidth / rightHeight
  return Math.abs(leftValue - rightValue) / rightValue <= 0.025
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}
