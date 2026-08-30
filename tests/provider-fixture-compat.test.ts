import { describe, expect, it } from 'vitest'
import {
  listModels,
  qwenImage,
  wanxTextToVideo,
} from '@bailian-studio/dashscope-manifests'
import {
  validateModelParams,
  type DeepReadonly,
  type FrozenModelManifest,
  type ModelParameter,
} from '../packages/model-core/src'
import { buildDashScopeRequest, parseDashScopeOutput } from '../packages/provider-dashscope/src'

const FIXTURE_URL = 'https://fixture.invalid/media'

function fixtureValue(parameter: DeepReadonly<ModelParameter>): unknown {
  if (parameter.defaultValue !== undefined) return parameter.defaultValue
  if (parameter.type === 'text') return FIXTURE_URL
  if (parameter.type === 'number') {
    if (parameter.min === undefined) return 1
    if (!parameter.exclusiveMin) return parameter.min
    const increment = parameter.step
      ?? (parameter.max === undefined ? 0.5 : (parameter.max - parameter.min) / 2)
    return parameter.min + increment
  }
  if (parameter.type === 'boolean') return false
  if (parameter.type === 'media') return FIXTURE_URL
  if (parameter.type === 'select') return parameter.options?.[0]?.value
  return undefined
}

function fixtureParams(manifest: FrozenModelManifest): Record<string, unknown> {
  return Object.fromEntries(manifest.parameters.map(parameter => [parameter.name, fixtureValue(parameter)]))
}

function fixtureOutput(manifest: FrozenModelManifest): unknown {
  switch (manifest.output.kind) {
    case 'images-from-message-content':
      return { output: { choices: [{ message: { content: [{ image: `${FIXTURE_URL}.png` }] } }] } }
    case 'video-url':
      return { output: { video_url: `${FIXTURE_URL}.mp4` } }
    case 'audio-url':
      return { output: { audio: { url: `${FIXTURE_URL}.mp3` } } }
    case 'text':
      if (manifest.output.path === 'output.choices.0.message.content') {
        return { output: { choices: [{ message: { content: 'fixture text' } }] } }
      }
      return { output: { text: 'fixture text' } }
    case 'asr-transcription':
      return { output: { results: [{ subtask_status: 'SUCCEEDED', transcription_url: `${FIXTURE_URL}.json` }] } }
    case 'custom':
      return { output: {} }
  }
}

function expectedArtifactKind(manifest: FrozenModelManifest): 'image' | 'video' | 'audio' | 'text' {
  switch (manifest.output.kind) {
    case 'images-from-message-content': return 'image'
    case 'video-url': return 'video'
    case 'audio-url': return 'audio'
    case 'text':
    case 'asr-transcription': return 'text'
    case 'custom': return 'text'
  }
}

function assertBoundValuePresent(
  manifest: FrozenModelManifest,
  params: Record<string, unknown>,
  request: ReturnType<typeof buildDashScopeRequest>,
): void {
  for (const [name, binding] of Object.entries(manifest.request.bindings)) {
    if (params[name] === undefined || binding === undefined || binding.target === 'ui.only') continue

    if (binding.target === 'input.prompt') {
      if (manifest.request.kind === 'dashscope-image-message') {
        expect(request.body.input.messages).toBeDefined()
      } else if (manifest.request.kind === 'dashscope-chat') {
        expect(request.body.input.messages).toEqual([
          { role: 'user', content: params[name] },
        ])
      } else {
        expect(request.body.input.prompt).toBe(params[name])
      }
    }
    if (binding.target === 'input.field') {
      expect(request.body.input[binding.field]).toEqual(
        binding.wrapInArray ? [params[name]] : params[name],
      )
    }
    if (binding.target === 'parameters.field') {
      expect(request.body.parameters?.[binding.field ?? name]).toEqual(
        binding.wrapInArray ? [params[name]] : params[name],
      )
    }
    if (binding.target === 'input.media') {
      if (manifest.request.kind === 'dashscope-image-message') {
        expect(request.body.input.messages).toEqual(expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([expect.objectContaining({ image: expect.any(String) })]),
          }),
        ]))
      } else {
        expect(request.body.input.media).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: binding.mediaType }),
        ]))
      }
    }
  }
}

describe('provider fixture compatibility', () => {
  it('builds a DashScope request from the real qwen image manifest', () => {
    const request = buildDashScopeRequest(qwenImage, {
      prompt: 'a small lantern in the rain',
      negativePrompt: 'blur',
      size: '1024*1024',
      n: 2,
    })

    expect(request.async).toBe(false)
    expect(request.endpoint).toBe('/services/aigc/multimodal-generation/generation')
    expect(request.body.model).toBe('qwen-image')
    expect(request.body.input).toEqual({
      messages: [{ role: 'user', content: [{ text: 'a small lantern in the rain' }] }],
    })
    expect(request.body.parameters).toEqual({
      negative_prompt: 'blur',
      size: '1024*1024',
      n: 2,
    })
  })

  it('builds a DashScope request from the real wanx video manifest', () => {
    const request = buildDashScopeRequest(wanxTextToVideo, {
      prompt: 'slow cinematic camera push',
      size: '1280*720',
      duration: 5,
    })

    expect(request.async).toBe(true)
    expect(request.endpoint).toBe('/services/aigc/video-generation/video-synthesis')
    expect(request.body.model).toBe('wanx2.1-t2v-turbo')
    expect(request.body.input).toEqual({ prompt: 'slow cinematic camera push' })
    expect(request.body.parameters).toEqual({
      size: '1280*720',
      duration: 5,
    })
  })

  it('builds a valid request fixture for every enabled manifest', () => {
    for (const manifest of listModels()) {
      const validation = validateModelParams(manifest, fixtureParams(manifest))
      if (!validation.valid) {
        throw new Error(`${manifest.id} fixture params are invalid: ${validation.errors.map(error => `${error.field}:${error.code}`).join(', ')}`)
      }

      const request = buildDashScopeRequest(manifest, validation.params)
      expect(request.endpoint).toBe(manifest.request.endpoint)
      expect(request.body.model).toBe(manifest.providerModel)
      expect(request.async).toBe(manifest.taskMode === 'provider_async')
      assertBoundValuePresent(manifest, validation.params, request)
    }
  })

  it('normalizes a representative output fixture for every enabled manifest', () => {
    for (const manifest of listModels()) {
      const raw = fixtureOutput(manifest)
      const output = parseDashScopeOutput(manifest, raw)

      expect(output.raw).toBe(raw)
      if (manifest.output.kind === 'custom') continue
      expect(output.artifacts.length).toBeGreaterThan(0)
      expect(output.artifacts[0]?.kind).toBe(expectedArtifactKind(manifest))
    }
  })
})
