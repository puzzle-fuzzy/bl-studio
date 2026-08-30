import { listModels } from '@bailian-studio/dashscope-manifests'

export interface BailianRuntimeSnapshot {
  readonly modelCount: number
  readonly enabledModelCount: number
  readonly provider: string
  readonly maintenance: 'manual'
}

/**
 * Worker 启动快照：DashScope manifest 包是模型目录事实源，注册表一致性由其模块加载时
 * 的 assertModelManifestConsistent 保证，这里只返回可记录的只读统计（模型数/启用数），
 * 便于从日志确认生产环境实际加载的目录规模。git 即版本，不再有 SDK 版本/catalog hash。
 */
export function verifyBailianRuntime(): BailianRuntimeSnapshot {
  const models = listModels()
  return Object.freeze({
    modelCount: models.length,
    enabledModelCount: models.filter(model => model.availability.enabled).length,
    provider: 'dashscope',
    maintenance: 'manual',
  })
}
