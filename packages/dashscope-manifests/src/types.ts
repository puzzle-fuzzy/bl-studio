import type {
  FrozenModelManifestContract,
  ModelManifestContract,
  ProviderOutputMapping,
  ProviderRequestMapping,
  ProviderTransport,
} from '@bailian-studio/model-core'

/** DashScope manifest 的 provider-specific 组合类型。 */
export type DashScopeModelManifest = ModelManifestContract<
  'dashscope',
  ProviderRequestMapping,
  ProviderOutputMapping,
  ProviderTransport
>

/** 深冻结后的 DashScope manifest，供 catalog / provider adapter 显式声明依赖。 */
export type FrozenDashScopeModelManifest = FrozenModelManifestContract<
  'dashscope',
  ProviderRequestMapping,
  ProviderOutputMapping,
  ProviderTransport
>
