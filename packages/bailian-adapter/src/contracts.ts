import {
  BailianContractError,
  bailian,
  type BailianContractValidationResult,
  type BailianHttpRequest,
  type ResponsePhase,
  type SupportedLocale,
} from '@puzzle-fuzzy/bailian-sdk'
import { requireCoveredRequirement } from './coverage'

export function validateBailianPayload(
  consumerId: string,
  payload: unknown,
  locale: SupportedLocale = 'zh-CN',
): BailianContractValidationResult {
  const requirement = requireCoveredRequirement(consumerId, locale)
  return bailian.models.validatePayloadUnknown({
    model: requirement.providerModelId,
    capability: requirement.capability,
    mode: requirement.mode,
    payload,
  })
}

export function validateBailianHttpRequest(
  consumerId: string,
  request: BailianHttpRequest,
  locale: SupportedLocale = 'zh-CN',
): BailianContractValidationResult {
  const requirement = requireCoveredRequirement(consumerId, locale)
  return bailian.models.validateHttpRequestUnknown({
    model: requirement.providerModelId,
    capability: requirement.capability,
    mode: requirement.mode,
    region: requirement.region,
    request,
  })
}

export function validateBailianResponse(
  consumerId: string,
  phase: ResponsePhase,
  response: unknown,
  locale: SupportedLocale = 'zh-CN',
): BailianContractValidationResult {
  const requirement = requireCoveredRequirement(consumerId, locale)
  return bailian.models.validateResponseUnknown({
    model: requirement.providerModelId,
    capability: requirement.capability,
    mode: requirement.mode,
    region: requirement.region,
    phase,
    response,
  })
}

export function assertBailianContractValid(
  result: BailianContractValidationResult,
  locale: SupportedLocale = 'zh-CN',
): void {
  if (!result.valid) throw new BailianContractError(result.issues, locale)
}
