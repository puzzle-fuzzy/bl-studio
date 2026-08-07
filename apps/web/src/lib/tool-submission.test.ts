import { describe, expect, it } from 'vitest'
import {
  TOOL_ASR_MODEL_IDS,
  TOOL_SCREENPLAY_MODEL_IDS,
  buildToolGenerationPayload,
  toolMediaParamName,
} from './tool-submission'

describe('tool submission assetRefs mapping (R2-P1-09 regression)', () => {
  it('maps screenplay models to the videoUrl media param declared by their manifests', () => {
    for (const modelId of TOOL_SCREENPLAY_MODEL_IDS) {
      expect(buildToolGenerationPayload(modelId, 'asset_video_1')).toEqual({
        modelId,
        params: {},
        assetRefs: { videoUrl: ['asset_video_1'] },
      })
    }
  })

  // P0-01 回归：fun-asr 的媒体参数名是 fileUrls（manifest 声明），曾错写成 audioUrl。
  it('maps fun-asr to the fileUrls media param (not the legacy audioUrl)', () => {
    expect(toolMediaParamName(TOOL_ASR_MODEL_IDS[0])).toBe('fileUrls')
    expect(buildToolGenerationPayload(TOOL_ASR_MODEL_IDS[0], 'asset_audio_1')).toEqual({
      modelId: 'fun-asr-v1',
      params: {},
      assetRefs: { fileUrls: ['asset_audio_1'] },
    })
  })

  it('rejects unknown tool model ids so new tools must opt in to a mapping', () => {
    expect(() => toolMediaParamName('qwen-image')).toThrow(/Unsupported tool model/)
  })
})
