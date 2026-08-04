import { describe, expect, it } from 'vitest'
import {
  BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE,
  resolveBailianSubmitTarget,
  validateBailianHttpRequest,
} from '@bailian-studio/bailian-adapter'
import {
  listModels,
  validateModelParams,
  type FrozenModelManifest,
} from '@bailian-studio/model-core'
import { buildOfflineFixtureParams } from '../src/acceptance'
import { buildChatRequest } from '../src/chat-builder'
import { createSdkHeaders } from '../src/http'
import { buildDashScopeRequest } from '../src/request-builder'

const manifests = listModels()

describe('Bailian Studio manifest -> Bailian SDK Contract v3 compatibility', () => {
  it('keeps every enabled product manifest on the official SDK baseline', () => {
    expect(manifests).toHaveLength(45)
    expect(BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.uncoveredRequirements).toBe(0)
    expect(manifests.map(({ id }) => id).sort()).toEqual(
      [...BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredConsumerIds].sort(),
    )
  })

  for (const manifest of manifests) {
    it(`${manifest.id} builds an SDK-valid HTTP request`, () => {
      const fixture = buildOfflineFixtureParams(manifest)
      expectSdkValidRequest(manifest, fixture, 'default fixture')

      for (const parameter of manifest.parameters) {
        for (const value of parameterVariants(parameter, fixture[parameter.name])) {
          expectSdkValidRequest(
            manifest,
            { ...fixture, [parameter.name]: value },
            `${parameter.name}=${JSON.stringify(value)}`,
          )
        }
      }
    })
  }
})

function expectSdkValidRequest(
  manifest: FrozenModelManifest,
  input: Record<string, unknown>,
  label: string,
): void {
  const productValidation = validateModelParams(manifest, input)
  expect(
    productValidation.valid,
    `${manifest.id}:${label} product validation: ${JSON.stringify(productValidation.errors)}`,
  ).toBe(true)
  if (!productValidation.valid) return

  const body = manifest.taskMode === 'stream'
    ? buildChatRequest(manifest, productValidation.params)
    : buildDashScopeRequest(manifest, productValidation.params).body
  const target = resolveBailianSubmitTarget(manifest.id, { workspaceId: 'ws-contract-test' })
  const headers = createSdkHeaders('test-key', target.headers)
  const contractValidation = validateBailianHttpRequest(manifest.id, {
    method: target.method,
    url: target.url,
    headers,
    body,
  })

  expect(
    contractValidation.valid,
    `${manifest.id}:${label} SDK validation: ${JSON.stringify(contractValidation.issues)}`,
  ).toBe(true)
}

function parameterVariants(
  parameter: FrozenModelManifest['parameters'][number],
  currentValue: unknown,
): readonly unknown[] {
  if (parameter.type === 'select') {
    return (parameter.options ?? [])
      .map(({ value }) => value)
      .filter((value) => JSON.stringify(value) !== JSON.stringify(currentValue))
  }
  if (parameter.type === 'boolean') return [currentValue === true ? false : true]
  if (currentValue !== undefined) return []
  if (parameter.type === 'text') return ['offline optional fixture']
  if (parameter.type === 'media') return [`https://fixture.invalid/${parameter.name}.media`]
  if (parameter.type === 'number') {
    if (parameter.min !== undefined && parameter.max !== undefined) {
      const midpoint = (parameter.min + parameter.max) / 2
      return [parameter.step === 1 ? Math.floor(midpoint) : midpoint]
    }
    if (parameter.min !== undefined) {
      return [parameter.exclusiveMin ? parameter.min + (parameter.step ?? 0.5) : parameter.min]
    }
    if (parameter.max !== undefined) {
      return [parameter.exclusiveMax ? parameter.max - (parameter.step ?? 0.5) : parameter.max]
    }
    return [1]
  }
  return []
}
