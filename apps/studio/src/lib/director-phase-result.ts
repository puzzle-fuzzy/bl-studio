export interface SafeParseSchema<Result> {
  safeParse(input: unknown): { success: true; data: Result } | { success: false }
}

export interface DirectorPhaseResultSpec<Result> {
  textKey: string
  resultKey: string
  schema: SafeParseSchema<Result>
}

export interface DirectorPhaseResult<Result> {
  text: string | undefined
  result: Result | undefined
  stale: boolean
}

/** 从阶段 run 的不透明输出中读取可展示文本，并只接受契约校验通过的结构化结果。 */
export function parseDirectorPhaseResult<Result>(
  outputSummary: Record<string, unknown> | null,
  staleAt: string | null,
  spec: DirectorPhaseResultSpec<Result>,
): DirectorPhaseResult<Result> {
  const textValue = outputSummary?.[spec.textKey]
  const text = typeof textValue === 'string' ? textValue : undefined
  const parsed = spec.schema.safeParse(outputSummary?.[spec.resultKey])
  return {
    text,
    result: parsed.success ? parsed.data : undefined,
    stale: staleAt !== null,
  }
}
