import {
  buildOfflineFixtureParams,
  createDashScopeClient,
  runOfflineModelAcceptance,
} from '../../packages/provider-dashscope/src/index'
import { getModelById } from '../../packages/model-core/src/index'

const liveModelId = process.argv.find(argument => argument.startsWith('--live='))?.slice('--live='.length)
const report = runOfflineModelAcceptance()

console.log(JSON.stringify({
  mode: 'offline',
  models: report.models,
  failures: report.failures,
}, null, 2))

if (report.failures.length > 0) {
  process.exitCode = 1
}

if (liveModelId !== undefined) {
  await runLiveCanary(liveModelId)
}

async function runLiveCanary(modelId: string): Promise<void> {
  const manifest = getModelById(modelId)
  if (manifest === undefined) {
    console.error(`Unknown or disabled model: ${modelId}`)
    process.exitCode = 1
    return
  }

  const apiKey = process.env.DASHSCOPE_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    console.error('DASHSCOPE_API_KEY is required for --live=<model-id>')
    process.exitCode = 1
    return
  }

  const client = createDashScopeClient({ apiKey })
  const params = buildOfflineFixtureParams(manifest)
  try {
    const result = manifest.taskMode === 'stream'
      ? await client.chat({ manifest, params })
      : await client.submit({ manifest, params, idempotencyKey: `acceptance:${manifest.id}` })
    console.log(JSON.stringify({
      mode: 'live-canary',
      modelId: manifest.id,
      taskMode: manifest.taskMode,
      status: result.mode,
    }))
    if (result.mode === 'failed') process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({
      mode: 'live-canary',
      modelId: manifest.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }))
    process.exitCode = 1
  }
}
