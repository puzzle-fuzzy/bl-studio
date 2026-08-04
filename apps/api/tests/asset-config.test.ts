import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_ASSET_SIZE_BYTES,
  DEFAULT_MAX_MEDIA_DURATION_SECONDS,
  readAssetConfig,
} from '../src/lib/asset-config'
import { DEFAULT_MAX_ARTIFACT_READ_BYTES, readArtifactConfig } from '../src/lib/artifact-config'

describe('asset runtime configuration', () => {
  it('parses upload size, media duration, and ffprobe path at the boundary', () => {
    const config = readAssetConfig({
      ASSET_MAX_SIZE_BYTES: '2097152',
      MEDIA_MAX_DURATION_SECONDS: '45.5',
      FFPROBE_PATH: '/usr/local/bin/ffprobe',
    })

    expect(config).toEqual({
      maxAssetSizeBytes: 2097152,
      maxMediaDurationSeconds: 45.5,
      ffprobePath: '/usr/local/bin/ffprobe',
    })
  })

  it('treats zero duration as unlimited and rejects invalid values through safe defaults', () => {
    expect(readAssetConfig({ MEDIA_MAX_DURATION_SECONDS: '0' })).toEqual({
      maxAssetSizeBytes: DEFAULT_MAX_ASSET_SIZE_BYTES,
      ffprobePath: 'ffprobe',
    })
    expect(readAssetConfig({
      ASSET_MAX_SIZE_BYTES: '-1',
      MEDIA_MAX_DURATION_SECONDS: ' ',
      FFPROBE_PATH: '  ',
    })).toEqual({
      maxAssetSizeBytes: DEFAULT_MAX_ASSET_SIZE_BYTES,
      maxMediaDurationSeconds: DEFAULT_MAX_MEDIA_DURATION_SECONDS,
      ffprobePath: 'ffprobe',
    })
  })
})

describe('artifact response configuration', () => {
  it('accepts a positive integer read limit and falls back safely', () => {
    expect(readArtifactConfig({ ARTIFACT_MAX_READ_BYTES: '4096' })).toEqual({ maxReadBytes: 4096 })
    expect(readArtifactConfig({ ARTIFACT_MAX_READ_BYTES: '1.5' })).toEqual({
      maxReadBytes: DEFAULT_MAX_ARTIFACT_READ_BYTES,
    })
  })
})
