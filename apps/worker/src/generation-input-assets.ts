import type { GenerationInputAsset } from '@bailian-studio/generation-repository'
import type { FrozenModelManifest } from '@bailian-studio/model-core'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskError } from '@bailian-studio/task-engine'

export const GENERATION_INPUT_ASSET_URL_TTL_SECONDS = 15 * 60

export interface ResolveGenerationInputParamsInput {
  readonly manifest: FrozenModelManifest
  readonly persistedParams: Readonly<Record<string, unknown>>
  readonly assets: readonly GenerationInputAsset[]
  readonly storage: StorageAdapter
  readonly expiresInSeconds?: number
}

/**
 * 供 generation task 处理器现有错误分类器消费的结构化输入解析失败。
 * 持久化数据违规属于不可重试的校验错误；存储签名临时失败属于可重试的系统错误。
 */
export class GenerationInputAssetResolutionError extends Error {
  readonly info: TaskError

  constructor(
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
    category: TaskError['category'] = 'validation',
    retriable = false,
  ) {
    super(message)
    this.name = 'GenerationInputAssetResolutionError'
    this.info = {
      category,
      code,
      message,
      retriable,
      ...(details === undefined ? {} : { details }),
    }
  }
}

/**
 * 将持久的 generation 资产绑定物化为短时效的 provider 输入 URL。
 * 返回对象是全新副本；DB params 与资产行均不变，因此每次 submit 重试都会拿到新签名的 URL。
 */
export async function resolveGenerationInputParams(
  input: ResolveGenerationInputParamsInput,
): Promise<Record<string, unknown>> {
  const resolvedParams: Record<string, unknown> = { ...input.persistedParams }
  if (input.assets.length === 0) return resolvedParams

  const grouped = new Map<string, GenerationInputAsset[]>()
  for (const asset of input.assets) {
    const parameter = input.manifest.parameters.find(candidate => candidate.name === asset.parameterName)
    if (parameter === undefined || parameter.type !== 'media') {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_PARAMETER_INVALID',
        `Generation asset ${asset.assetId} targets a non-media parameter: ${asset.parameterName}`,
        asset,
      )
    }
    if (parameter.mediaKind !== undefined && parameter.mediaKind !== asset.kind) {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_KIND_INVALID',
        `Generation asset ${asset.assetId} is ${asset.kind}, expected ${parameter.mediaKind}`,
        asset,
      )
    }
    if (!Number.isSafeInteger(asset.position) || asset.position < 0) {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_POSITION_INVALID',
        `Generation asset ${asset.assetId} has an invalid position`,
        asset,
      )
    }
    const assets = grouped.get(asset.parameterName) ?? []
    if (assets.some(candidate => candidate.position === asset.position)) {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_POSITION_INVALID',
        `Generation parameter ${asset.parameterName} has duplicate position ${asset.position}`,
        asset,
      )
    }
    assets.push(asset)
    grouped.set(asset.parameterName, assets)
  }

  for (const [parameterName, assets] of grouped) {
    const parameter = input.manifest.parameters.find(candidate => candidate.name === parameterName)
    if (parameter === undefined || parameter.type !== 'media') {
      throw new GenerationInputAssetResolutionError(
        'GENERATION_INPUT_ASSET_PARAMETER_INVALID',
        `Generation asset parameter is invalid: ${parameterName}`,
        { parameterName },
      )
    }

    assets.sort((left, right) => left.position - right.position)
    const maximum = parameter.maxItems ?? 1
    if (assets.length > maximum) {
      throw new GenerationInputAssetResolutionError(
        'GENERATION_INPUT_ASSET_COUNT_INVALID',
        `Generation parameter ${parameterName} accepts at most ${maximum} assets`,
        { parameterName, count: assets.length, maximum },
      )
    }

    const urls: string[] = []
    for (const asset of assets) {
      urls.push(await resolveAssetUrl(asset, input.storage, input.expiresInSeconds))
    }
    resolvedParams[parameterName] = maximum > 1 ? urls : urls[0]
  }

  return resolvedParams
}

async function resolveAssetUrl(
  asset: GenerationInputAsset,
  storage: StorageAdapter,
  expiresInSeconds = GENERATION_INPUT_ASSET_URL_TTL_SECONDS,
): Promise<string> {
  if (asset.storageProvider !== undefined && asset.storageKey === undefined) {
    throw resolutionError(
      'GENERATION_INPUT_ASSET_STORAGE_INVALID',
      `Generation asset ${asset.assetId} has a storage provider without a key`,
      asset,
    )
  }

  if (asset.storageKey !== undefined) {
    const storageProvider = readStorageProvider(asset)
    if (storageProvider === undefined) {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_STORAGE_INVALID',
        `Generation asset ${asset.assetId} has a storage key without a provider`,
        asset,
      )
    }
    if (storageProvider !== storage.provider) {
      throw resolutionError(
        'GENERATION_INPUT_ASSET_STORAGE_MISMATCH',
        `Generation asset ${asset.assetId} uses ${storageProvider}, but the worker uses ${storage.provider}`,
        asset,
      )
    }
    let signedUrl: string
    try {
      signedUrl = await storage.createReadUrl({
        key: asset.storageKey,
        expiresInSeconds,
      })
    } catch {
      throw operationalResolutionError(
        'GENERATION_INPUT_ASSET_STORAGE_UNAVAILABLE',
        'Unable to create a provider-readable URL for generation input asset',
        asset,
      )
    }
    return validateProviderUrl(signedUrl, asset)
  }

  if (asset.source === 'link' && asset.originalUrl !== undefined) {
    return validateProviderUrl(asset.originalUrl, asset)
  }

  if (asset.source !== 'link') {
    throw resolutionError(
      'GENERATION_INPUT_ASSET_STORAGE_MISSING',
      `Generation asset ${asset.assetId} requires durable storage coordinates`,
      asset,
    )
  }

  throw resolutionError(
    'GENERATION_INPUT_ASSET_SOURCE_MISSING',
    `Generation asset ${asset.assetId} has no resolvable source`,
    asset,
  )
}

function validateProviderUrl(value: string, asset: GenerationInputAsset): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw invalidUrl(asset)
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username.length > 0
    || parsed.password.length > 0
  ) {
    throw invalidUrl(asset)
  }
  return parsed.toString()
}

function invalidUrl(asset: GenerationInputAsset): GenerationInputAssetResolutionError {
  return resolutionError(
    'GENERATION_INPUT_ASSET_URL_INVALID',
    `Generation asset ${asset.assetId} must resolve to an absolute HTTP(S) URL without credentials`,
    asset,
  )
}

function resolutionError(
  code: string,
  message: string,
  asset: GenerationInputAsset,
): GenerationInputAssetResolutionError {
  return new GenerationInputAssetResolutionError(code, message, {
    assetId: asset.assetId,
    parameterName: asset.parameterName,
    position: asset.position,
  })
}

function operationalResolutionError(
  code: string,
  message: string,
  asset: GenerationInputAsset,
): GenerationInputAssetResolutionError {
  return new GenerationInputAssetResolutionError(code, message, {
    assetId: asset.assetId,
    parameterName: asset.parameterName,
    position: asset.position,
  }, 'system', true)
}

function readStorageProvider(asset: GenerationInputAsset): string | undefined {
  return typeof asset.storageProvider === 'string' ? asset.storageProvider : undefined
}
