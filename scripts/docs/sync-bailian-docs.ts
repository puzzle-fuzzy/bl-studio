/**
 * 官网漂移检查（按需执行，不 gate）。
 *
 * AI 维护工作流：官网变更 → 抓文档 → AI 读原文更新对应 manifest（transport/rules/
 * pricing/parameters）→ `bun run verify` → 部署。git 即版本。
 *
 * 本脚本只做「漂移检测」：抓百炼 OpenAI 兼容面 `GET /compatible-mode/v1/models`
 * （机器可读清单，覆盖 chat / embedding / 第三方模型），与 DashScope manifest 包的目录
 * providerModel 对账，报告：
 *  - official-new：官方有、manifest 没有的模型（新增候选，需要决定是否建模）；
 *  - compatible-retired：chat 面 manifest 的 providerModel 不在官方清单里（可能已
 *    从兼容面下线，也可能只是清单不含该面——需要人工复核，脚本不下结论）。
 *
 * 局限（脚本明确提示）：媒体生成面（文生图/文生视频/音频）没有 `/models` 机器清单，
 * pricing 也没有机器可读源，这两类的漂移只能人工比对官方文档后改 manifest。
 *
 * 安全红线：DASHSCOPE_API_KEY 只从 env 读取，绝不打印、绝不落盘。无 key / 认证
 * 失败 → `SKIPPED` 并退出 0（不阻塞，但明确报告「未验证」）；网络失败 → 退出非 0。
 */

import { listModels } from '@bailian-studio/dashscope-manifests'

const COMPATIBLE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export type SyncBailianDocsResult =
  | { status: 'skipped'; reason: string }
  | {
      status: 'checked'
      officialCount: number
      manifestCount: number
      officialNew: string[]
      compatibleRetired: string[]
    }

/** 兼容面有机器清单的 manifest 子集：请求体走 dashscope-chat 的 chat 模型。 */
function compatibleSurfaceManifests() {
  return listModels().filter(manifest => manifest.request.kind === 'dashscope-chat')
}

export async function syncBailianDocs(fetchFn: typeof fetch = fetch): Promise<SyncBailianDocsResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    return { status: 'skipped', reason: 'DASHSCOPE_API_KEY not set（只检查清单类模型，可跳过）' }
  }

  const response = await fetchFn(`${COMPATIBLE_BASE}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    return { status: 'skipped', reason: `认证失败 HTTP ${response.status}（不打印响应体）` }
  }

  const body = await response.json() as { data?: Array<{ id: unknown }> }
  const officialIds = new Set(
    (body.data ?? [])
      .map(item => (typeof item.id === 'string' ? item.id : undefined))
      .filter((id): id is string => id !== undefined),
  )

  const manifests = listModels()
  const coveredProviderModels = new Set(manifests.map(manifest => manifest.providerModel))
  const officialNew = [...officialIds].filter(id => !coveredProviderModels.has(id)).sort()

  const compatibleManifests = compatibleSurfaceManifests()
  const compatibleProviderModels = new Set(compatibleManifests.map(manifest => manifest.providerModel))
  const compatibleRetired = [...compatibleProviderModels].filter(id => !officialIds.has(id)).sort()

  return {
    status: 'checked',
    officialCount: officialIds.size,
    manifestCount: manifests.length,
    officialNew,
    compatibleRetired,
  }
}

if (import.meta.main) {
  const result = await syncBailianDocs()

  if (result.status === 'skipped') {
    console.log(`[sync-bailian-docs] SKIPPED — ${result.reason}`)
  }
  else {
    console.log(`[sync-bailian-docs] 官方兼容面 ${result.officialCount} 个模型 vs manifest ${result.manifestCount} 份`)
    console.log(`- 官方新增候选（manifest 未覆盖）：${result.officialNew.length === 0 ? '无' : result.officialNew.join(', ')}`)
    console.log(`- chat 面疑似退役（需人工复核）：${result.compatibleRetired.length === 0 ? '无' : result.compatibleRetired.join(', ')}`)
    console.log('注意：媒体生成面（图/视频/音频）与 pricing 无机器清单，漂移需人工比对官方文档后改 manifest。')
  }

  // 网络失败才会走到非 0：fetch 抛错时异常向上传播，进程以非 0 退出（live 检查不能假装成功）。
}
