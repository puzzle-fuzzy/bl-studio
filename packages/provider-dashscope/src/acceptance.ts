import {
  isModelParameterVisible,
  listModels,
  validateModelParams,
  type DeepReadonly,
  type FrozenModelManifest,
  type ModelParameter,
} from '@bailian-studio/model-core'
import { buildDashScopeRequest } from './request-builder'
import { parseDashScopeOutput } from './response-parser'

export type ModelAcceptanceStatus = 'fixture-covered' | 'fixture-failed'
export type ModelAcceptanceFixtureStatus = 'covered' | 'not-covered'

export interface ModelAcceptanceResult {
  readonly modelId: string
  readonly provider: string
  readonly operationFamily: FrozenModelManifest['taskMode']
  readonly requestKind: FrozenModelManifest['request']['kind']
  readonly status: ModelAcceptanceStatus
  readonly requestFixtureStatus: ModelAcceptanceFixtureStatus
  readonly responseFixtureStatus: ModelAcceptanceFixtureStatus
  readonly issues: readonly string[]
}

export interface ModelAcceptanceFailure {
  readonly modelId: string
  readonly code: 'UNSUPPORTED_PROVIDER' | 'INVALID_FIXTURE' | 'REQUEST_BUILD_FAILED' | 'RESPONSE_FIXTURE_FAILED'
  readonly message: string
}

export interface ModelAcceptanceReport {
  readonly models: readonly ModelAcceptanceResult[]
  readonly failures: readonly ModelAcceptanceFailure[]
}

/**
 * 为离线请求校验构建确定性、非敏感的输入值。除非运维显式运行线上 canary 脚本，
 * 这些值绝不会发送给 provider。
 */
export function buildOfflineFixtureParams(manifest: FrozenModelManifest): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  // 用 manifest 声明的 discriminator 值激活条件字段。
  for (const parameter of manifest.parameters) {
    if (parameter.visibleWhen !== undefined && params[parameter.visibleWhen.field] === undefined) {
      params[parameter.visibleWhen.field] = parameter.visibleWhen.equals
    }
  }

  for (const parameter of manifest.parameters) {
    if (parameter.defaultValue !== undefined && params[parameter.name] === undefined) {
      params[parameter.name] = parameter.defaultValue
    }
    if (parameter.required && params[parameter.name] === undefined) {
      params[parameter.name] = fixtureValue(parameter)
    }
  }

  for (const group of manifest.mediaGroups ?? []) {
    const conditionMatches = group.when === undefined
      || (mediaItemCount(params[group.when.field]) > 0) === group.when.present
    if (!conditionMatches || group.minItems === undefined) continue

    const currentCount = group.parameters.reduce(
      (total, name) => total + mediaItemCount(params[name]),
      0,
    )
    if (currentCount >= group.minItems) continue

    const parameter = manifest.parameters.find(candidate =>
      group.parameters.includes(candidate.name)
      && candidate.type === 'media'
      && isModelParameterVisible(candidate, params),
    )
    if (parameter === undefined) continue

    const requiredCount = Math.max(
      parameter.minItems ?? 1,
      group.minItems - currentCount,
    )
    const count = Math.min(requiredCount, parameter.maxItems ?? 1)
    const values = Array.from(
      { length: count },
      (_, index) => `https://fixture.invalid/${parameter.name}-${index + 1}.media`,
    )
    params[parameter.name] = values.length === 1 ? values[0] : values
  }

  return params
}

export function runOfflineModelAcceptance(
  manifests: readonly FrozenModelManifest[] = listModels(),
): ModelAcceptanceReport {
  const models: ModelAcceptanceResult[] = []
  const failures: ModelAcceptanceFailure[] = []

  for (const manifest of manifests) {
    const base = {
      modelId: manifest.id,
      provider: manifest.provider,
      operationFamily: manifest.taskMode,
      requestKind: manifest.request.kind,
    } satisfies Pick<ModelAcceptanceResult, 'modelId' | 'provider' | 'operationFamily' | 'requestKind'>

    if (manifest.provider !== 'dashscope') {
      const failure = {
        modelId: manifest.id,
        code: 'UNSUPPORTED_PROVIDER' as const,
        message: `No DashScope acceptance runner is registered for provider ${manifest.provider}`,
      }
      failures.push(failure)
      models.push({
        ...base,
        status: 'fixture-failed',
        requestFixtureStatus: 'not-covered',
        responseFixtureStatus: 'not-covered',
        issues: [failure.message],
      })
      continue
    }

    const params = buildOfflineFixtureParams(manifest)
    const validation = validateModelParams(manifest, params)
    if (!validation.valid) {
      const issues = validation.errors.map(issue => `${issue.field}: ${issue.message}`)
      failures.push({ modelId: manifest.id, code: 'INVALID_FIXTURE', message: issues.join('; ') })
      models.push({
        ...base,
        status: 'fixture-failed',
        requestFixtureStatus: 'not-covered',
        responseFixtureStatus: 'not-covered',
        issues,
      })
      continue
    }

    try {
      const request = buildDashScopeRequest(manifest, validation.params)
      if (request.body.model !== manifest.providerModel || request.endpoint !== manifest.request.endpoint) {
        const message = 'Manifest request did not preserve provider model or endpoint'
        failures.push({ modelId: manifest.id, code: 'REQUEST_BUILD_FAILED', message })
        models.push({
          ...base,
          status: 'fixture-failed',
          requestFixtureStatus: 'not-covered',
          responseFixtureStatus: 'not-covered',
          issues: [message],
        })
        continue
      }
      const response = parseDashScopeOutput(manifest, buildOfflineResponseFixture(manifest))
      const responseFixtureStatus = response.artifacts.length > 0 ? 'covered' : 'not-covered'
      if (responseFixtureStatus !== 'covered') {
        const message = `No normalized artifact produced for output mapping ${manifest.output.kind}`
        failures.push({ modelId: manifest.id, code: 'RESPONSE_FIXTURE_FAILED', message })
        models.push({
          ...base,
          status: 'fixture-failed',
          requestFixtureStatus: 'covered',
          responseFixtureStatus,
          issues: [message],
        })
        continue
      }
      models.push({
        ...base,
        status: 'fixture-covered',
        requestFixtureStatus: 'covered',
        responseFixtureStatus,
        issues: [],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ modelId: manifest.id, code: 'REQUEST_BUILD_FAILED', message })
      models.push({
        ...base,
        status: 'fixture-failed',
        requestFixtureStatus: 'not-covered',
        responseFixtureStatus: 'not-covered',
        issues: [message],
      })
    }
  }

  return { models, failures }
}

function buildOfflineResponseFixture(manifest: FrozenModelManifest): Record<string, unknown> {
  switch (manifest.output.kind) {
    case 'images-from-message-content':
      return { output: { choices: [{ message: { content: [{ image: 'https://fixture.invalid/output.png' }] } }] } }
    case 'video-url':
      return { output: { video_url: 'https://fixture.invalid/output.mp4' } }
    case 'audio-url':
      return { output: { audio: { url: 'https://fixture.invalid/output.mp3' } } }
    case 'text':
      return manifest.output.path === 'output.choices.0.message.content'
        ? { output: { choices: [{ message: { content: 'offline acceptance fixture output' } }] } }
        : { output: { text: 'offline acceptance fixture output' } }
    case 'asr-transcription':
      return { output: { results: [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://fixture.invalid/transcription.json' }] } }
    case 'custom':
      return {}
  }
}

function fixtureValue(parameter: DeepReadonly<ModelParameter>): unknown {
  switch (parameter.type) {
    case 'number':
      return parameter.min ?? 1
    case 'boolean':
      return false
    case 'select':
      return parameter.options?.[0]?.value ?? ''
    case 'media':
      return `https://fixture.invalid/${parameter.name}.media`
    case 'text':
      return parameter.name.toLowerCase().includes('prompt')
        ? 'offline acceptance fixture prompt'
        : `https://fixture.invalid/${parameter.name}`
  }
}

function mediaItemCount(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0
  return Array.isArray(value) ? value.length : 1
}
